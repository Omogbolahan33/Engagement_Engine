#!/bin/bash
# Insert N engagements so the list crosses VIRTUALIZE_THRESHOLD (100) and the
# Engagements table switches to windowed rendering.
#   ./scripts/seed-bulk-engagements.sh 150
N=${1:-150}
docker exec engagement-postgres psql -U postgres -d engagement_platform -tAc "
INSERT INTO engagements (id,\"siteId\",name,\"engagementType\",config,\"targetConfig\",schedule,frequency,status,priority,\"retryConfig\",\"createdAt\",\"updatedAt\")
SELECT gen_random_uuid()::text,
       (SELECT id FROM sites ORDER BY random() LIMIT 1),
       'Bulk engagement ' || g,
       (ARRAY['LIKE','CREATE_COMMENT','SHARE_POST','FOLLOW_USER','SCRAPE_CONTENT'])[1+(g%5)]::\"EngagementType\",
       '{}','{}','{}','{\"maxPerMinute\":1,\"maxPerHour\":10,\"maxPerDay\":100}',
       (ARRAY['DRAFT','ACTIVE','PAUSED','FAILED'])[1+(g%4)]::\"EngagementStatus\",
       5,'{}',now(),now()
FROM generate_series(1,$N) g;
SELECT 'total engagements = '||count(*) FROM engagements;"
