# Data attribution and licences

Application code and distributed data are separate works. No publisher endorses Meridian. Data is supplied without warranties under the linked licences.

## UCI Online Retail II

Chen, D. (2012). Online Retail II. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D.

Source: https://archive.ics.uci.edu/dataset/502/online+retail+ii
Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/

The built-in report and eight country CSVs are derived from the original workbook. Country CSVs select merchandise codes and countries, format dates and identifiers, and retain source duplicates and credits. The analytical report separately cleans and aggregates records. The original quick sample remains available. Subsets do not represent independent retailers.

## Brazilian E-Commerce Public Dataset by Olist

Olist. (2018). Brazilian E-Commerce Public Dataset by Olist. Kaggle.

Source: https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce
Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International, https://creativecommons.org/licenses/by-nc-sa/4.0/

Olist sample CSVs and their adapted data outputs are distributed under the same CC BY-NC-SA 4.0 licence, for noncommercial educational use. Retain attribution, this licence notice and the source link when sharing them. The licence does not grant publisher endorsement. Consult the linked public licence for its full disclaimer of warranties and limitation of liability.

Changes: join the original order, item, customer, product and category-translation tables; select delivered purchases in 2017 Q1, Q2 and Q3; alias identifiers consistently; use customer_unique_id for repeat-buyer identity; combine repeated order/product/price unit lines into quantities. Descriptions are category labels and SKU aliases, not published product names. Original BRL merchandise prices are retained; freight is excluded. Cancelled orders and refunds are outside these subsets. Per-file hashes and transformations are in public/data/samples/catalog.json.

## UCI Sales Transactions Weekly

Tan, J. (2014). Sales Transactions Weekly. UCI Machine Learning Repository. https://doi.org/10.24432/C5XS4Q.

Source: https://archive.ics.uci.edu/dataset/396/sales+transactions+dataset+weekly
Licence: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/

The original 811-row CSV is retained in public/data/evidence. The derived benchmark uses raw purchased quantities W0–W51, not normalized columns. It selects a global forecasting method on W32–W43 and evaluates all methods on W44–W51. It introduces no artificial transaction prices, customers or calendar dates. Results are exploratory retrospective evaluation, not proof of commercial profit.
