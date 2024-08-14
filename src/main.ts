import { execSync } from 'child_process';

// Log a custom message to verify the commit
const commitHash = execSync('git rev-parse HEAD').toString().trim();
console.log(`Running dbt-mermaid from my fork. Commit SHA: ${commitHash}`);

import * as fs from "fs/promises";
import * as core from "@actions/core";
import * as process from "process";
import * as yaml from "js-yaml";
import { exec, go, isTrue } from "./utils";
import { SupportedResourceType, isDBTProjectYml } from "./dbt";
import { Flowchart } from "./flowchart";

export async function main() {
  const back = go(core.getInput("dbt-project"));
  await preprocess();

  const ignore: { [key in SupportedResourceType]: boolean } = {
    source: isTrue("ignore-sources"),
    seed: isTrue("ignore-seeds"),
    model: false,
    snapshot: isTrue("ignore-snapshots"),
    exposure: isTrue("ignore-exposures"),
    analysis: isTrue("ignore-analyses"),
    test: isTrue("ignore-tests"),
  };
  const mainChart = await Flowchart.from("./target/manifest.json", ignore);
  back();

  const anotherProject = core.getInput("dbt-project-to-compare-with");
  if (anotherProject) {
    const back = go(anotherProject);
    await preprocess();
    const anotherChart = await Flowchart.from("./target/manifest.json", ignore);
    mainChart.compare(anotherChart);
    back();
  }
  const drawEntireLineage = isTrue("draw-entire-lineage");
  const saveTextSize = isTrue("save-text-size");
  const chart = mainChart.plot(drawEntireLineage, saveTextSize);
  const outpath = `${process.cwd()}/lineage.mermaid`;
  await fs.writeFile(outpath, chart);
  core.setOutput("filepath", outpath);
}

function dummyProfile(profile: string) {
  return {
    [profile]: {
      target: "dev",
      outputs: {
        dev: {
          type: "snowflake",
          account: process.env.SNOWFLAKE_ACCOUNT,
          user: process.env.SNOWFLAKE_USER,
          password: process.env.SNOWFLAKE_PASSWORD,
          role: process.env.SNOWFLAKE_ROLE,
          warehouse: process.env.SNOWFLAKE_WAREHOUSE,
          database: process.env.SNOWFLAKE_DATABASE,
          schema: "public",
        },
      },
    },
  };
}

async function preprocess() {
  const dbtVersion = core.getInput("dbt-version");
  const profiles = "profiles.yml";
  const obj = await fs
    .readFile("./dbt_project.yml")
    .then((buf) => buf.toString())
    .then((str) => yaml.load(str));
  if (!isDBTProjectYml(obj)) {
    throw "cannot read profile name from dbt_project.yml";
  }

  let cleanup = async () => await fs.unlink(profiles);
  await fs
    .access(profiles)
    .then(async () => {
      const temp = `${profiles}.backup`;
      await fs.rename(profiles, temp);
      cleanup = async () => fs.rename(temp, profiles);
    })
    .catch(() => {}); // NOP

  await fs.writeFile(profiles, JSON.stringify(dummyProfile(obj.profile)));

  // Debugging output to verify what's happening
  console.log(`Running dbt deps with version: dbt-snowflake==${dbtVersion}`);
  await exec(`pipx run --spec dbt-snowflake==${dbtVersion} dbt deps`);

  console.log(`Running dbt ls with version: dbt-snowflake==${dbtVersion}`);
  await exec(`pipx run --spec dbt-snowflake==${dbtVersion} dbt ls`);

  await cleanup();
}
