{% snapshot products_snapshot %}
    {{
        config(
            target_database="{{ target.database }}",
            target_schema="snapshot",
            unique_key="id",
            strategy="timestamp",
            updated_at="updated_at",
        )
    }}
    select *
    from {{ source("source", "products") }}
{% endsnapshot %}
