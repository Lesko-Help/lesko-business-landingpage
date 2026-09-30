# Goal
Status: as-built 2026-09-30

## What this repo is for
The page at leskobusiness.com that sells LeskoHelp Pro to business owners
and sends the buyer to Recurly's hosted checkout for one of three plans
(`business-monthly` $29.95, `business-half-year` $89.95, `business-yearly`
$149.95).

## Who uses it
Giulia writes it (copy and images, pushed to `main` through GitHub); Matthew
sends people to it; a buyer who pays there gets Mighty Networks access from
lesko-provisioning within about 20 seconds.

## The number that says it works
Recurly transactions with origin `hpp` and a `business-*` plan: 2 on
2026-09-29 (both tests, since refunded or to be refunded), 0 real buyers so
far. Read it in `provisioning_models.stg_recurly_transactions`
(lesko-486515) or in Recurly's Subscriptions list filtered on the three
plan codes.

<!-- spec:template -->
