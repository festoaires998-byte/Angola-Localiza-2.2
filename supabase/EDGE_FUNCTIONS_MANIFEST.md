# Supabase Edge Functions — deployment manifest

Generated from project `qntbknegicaghnbnghyw` on 2026-09-30; updated 2026-10-01 (public-api v9, signing-keys v5, phone-verify v6, limpeza-kyc v1, apagar-conta v1).

`identity-kyc` (code v7) deployed on 2026-10-01 as server version 8, after the owner created the `KYC_PEPPER` secret.

The Git repository is the versioned source of truth. This manifest records the currently deployed Supabase state that has been reconciled into `supabase/functions/`.

| Function | Deployed version | Status | verify_jwt | Deployed SHA256 |
|---|---:|---|---|---|
| generate-postal-code | 8 | ACTIVE | true | ea14d8afbe7d87a907b74346b47aad54bd2c281483c32e49062897c64dcaaef6 |
| qr-service | 6 | ACTIVE | true | 24eb3d750a1fd8b88e86c1a5bb8503de287f75028a89a3a949cf6abe26dbab77 |
| search | 5 | ACTIVE | false | 14636a16bc22e9cc97882e755cb3805170d6f8a75c29ea157ab22de8405e7556 |
| address-card | 9 | ACTIVE | true | 0b38f83f48a230d6073f86349a681615563a755c229d4c61b0093dcd62acbe32 |
| sync | 18 | ACTIVE | true | cc012c58a64ab4d2f0f92f664b27d0c790c6d246259978de0e4ac5ef691d7bd7 |
| deliveries | 38 | ACTIVE | false | a0d99464e319789f727ffd854de4a786ece8ea37d1b960faf192cafb924d8a17 |
| field-service | 37 | ACTIVE | true | 5ef5882f1010e94f8b10d41ea3a8b67664185ac71cee40bc4b7f886790e54a7c |
| admin | 15 | ACTIVE | true | 34b834f61af5fbc4ef9fdac670a7faf7c2a9cbf24afa678910bb45f4a5de6bb1 |
| api-keys | 6 | ACTIVE | true | a3994e4f9d6a2312342c46e97d83a17606b0581142a48c27c7ee160d478f6e69 |
| public-api | 9 | ACTIVE | false | 89a4ee7e67c1a116d36dd0a5a3f973dd327707ec6f97a46f58a06ba35ddfb7c5 |
| imports | 6 | ACTIVE | true | 1511da93ffdf519f94d094bcef78e7817df3bcacdf6735c00b1ae5d6e8a8b53c |
| exports | 6 | ACTIVE | true | 79800be60343dc39569d5b3c4c65fe0a892538535bbd3d2098d9bae20ef695a7 |
| health | 3 | ACTIVE | false | a228198692f5ce30fa9aa553955a1f633d3a938b56bfe626bcf7aa19b7defdc2 |
| invite-user | 7 | ACTIVE | true | e3b1fe66d39da6c0bdf70e37966f82865a8b56633128806c24d1619318e8ebd7 |
| pricing | 5 | ACTIVE | true | 98aaf16f38da390bec51e41ca7f71eaae5cb219313debb9027d6cb7830972509 |
| join-link | 6 | ACTIVE | false | 53e2e1c5fd84d0e608f1472b497085a24669743b4a50646cd277cfa629b85166 |
| identity-kyc | 8 | ACTIVE | true | f9600d2e94820f366ad5f638ca5b0c743ab53da6f2e32636be84cbffc1a585de |
| chat | 8 | ACTIVE | false | 78502f0eebae465d64e5e0f78648c883521b115fc7576e290684dff3778bf8a1 |
| phone-verify | 6 | ACTIVE | false | 7f0583ca6896ed51a41741a1ab71dcf40fbf7b2a7bf68d440ddf9722a785b081 |
| citizen-verify | 8 | ACTIVE | true | 26d683d5c28c5a7b6ef13548d7753533481ed9e98dcbc09d1f8df47735c94dea |
| signing-keys | 5 | ACTIVE | true | 53bd30cd3155b4599a9126b343cee93db2a17daf9b832761806503f98bf909c1 |
| address-history | 6 | ACTIVE | true | 4692dd58831213ae14bfc5cbdc713b0ee2508c15819911266f62b844ab5b0056 |
| resolve-address | 4 | ACTIVE | false | fc7bc9439832dbd8685fb017222f30c3bf8d1788eae099c59728c76c799af7d4 |
| offline-zone | 5 | ACTIVE | true | 3b0d771f133bf44ccb3d0ceeb98cedc0c020e8bacea4733f090ecfe71d02c66a |
| geocode | 4 | ACTIVE | false | 1a61b335e45bcf3c0d57822c08e0e741a9739f83e300080512c021e374439e1b |
| pesquisa | 3 | ACTIVE | false | 15a753d583005d112ab022e59261a11cae711e2c10ff0e5a02a6be857a7f8db2 |
| marketplace | 6 | ACTIVE | true | 24e0d08c0b930b930f77af13de9eb6d99750e490102cca9ffc4d288245f81085 |
| migrate-legacy-proofs | 1 | ACTIVE | true | 73d0086138cdbc1845b048f86f33dfc90038a607b9dca74b9861c8752e490ece |
| limpeza-kyc | 1 | ACTIVE | false | 5f5eaff92fec5025703cf1dac7d07ce3790a490ea123bf57cac9e013fe859611 |
| apagar-conta | 1 | ACTIVE | true | 73fcb3c2d78487dba1dafd66c41e348c46b86eb0452c03c93a8c432d2202e0b3 |
| driver-kyc | 4 | ACTIVE | true | 9f94f399070c5d9a83b512ffc88e3b1698cce4f7cf422408bb8694e7c544eb85 |

`search` and `resolve-address` stay deployed only to answer 410 (disabled); the app and the site use `pesquisa`.

## Reconciliation rule

Do not edit production Edge Functions manually without bringing the resulting source back into this repository. Deployments must originate from versioned repository code after review and tests.
