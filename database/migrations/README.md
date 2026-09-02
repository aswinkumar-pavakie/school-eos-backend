# Database Migrations (hand-written SQL)

This directory holds the hand-written SQL migrations that are the executable
physical-schema authority for this project — not `prisma migrate`.

Per the HLD (`school-eos-hld-FINAL.md`, "The SQL is the source of truth" /
Key Design Decision #3) and the LLD (`School_EOS_Master_LLD_v5_1.pdf`,
§10.1 Persistence rule, §14.3 Database migrations): the schema depends on
CHECK constraints, partial unique indexes, `EXCLUDE USING gist` range
constraints and immutability triggers that Prisma cannot express. Migrations
are written here as plain SQL and applied directly to PostgreSQL; afterwards
`prisma/schema.prisma` is regenerated from the resulting database with
`prisma db pull`, never the other way around.
