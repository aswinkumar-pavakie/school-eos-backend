# School EOS Mermaid ERD Bundle

This bundle intentionally does NOT force the entire schema into one field-level graph.

The source design explicitly recommends:
1. one master ERD showing domain-level relationships; and
2. domain ERDs for the detailed tables.

The master map is `00_MASTER_DOMAIN_MAP.mmd`.
The remaining files are the complete field-level domain ERDs.

## Why this is better in draw.io
A single graph containing hundreds of tables and hundreds of foreign-key edges creates a hairball because Mermaid's automatic layout has no reliable manual positioning contract. Domain boundaries reduce cross-edge pressure and make each diagram reviewable.

## Import
In draw.io / diagrams.net:
- Arrange → Insert → Advanced → Mermaid
- paste one `.mmd` file at a time
- use `00_MASTER_DOMAIN_MAP.mmd` as the architecture overview
- use the numbered domain ERDs for detailed schema review

## Conservative schema cleanup
Only three tables were removed from the working schema for this revision:
- `purchase_requests`
- `purchase_request_items`
- `vehicle_tracking_sessions`

They are not part of the approved business workflows / domain core and are redundant with the authoritative expense/vendor and trip lifecycle models. No core student, academic, finance, wallet, canteen, hostel, transport, health, camp, sports, communication, workflow, evidence or audit table was removed.

All other current schema tables are preserved.

## Authority
PostgreSQL migrations are the executable source of truth. Mermaid is the visualization/documentation layer.
