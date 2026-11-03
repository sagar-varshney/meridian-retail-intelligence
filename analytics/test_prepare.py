import unittest
import numpy as np
import pandas as pd
from prepare import apriori,forecast

class StudyTests(unittest.TestCase):
    def test_apriori_keeps_supported_triples_and_prunes_infrequent_items(self):
        baskets=[{'A','B','C'}]*40+[{'A','B'}]*30+[{'A'}]*20+[{'D'}]*10
        support,_=apriori(baskets,min_support=.2,max_items=10,max_length=3)
        self.assertEqual(support[('A','B','C')],40)
        self.assertEqual(support[('A','B')],70)
        self.assertNotIn(('D',),support)
        self.assertNotIn(('A','D'),support)

    def test_forecasts_do_not_use_future_target_values(self):
        index=pd.date_range('2010-01-04',periods=90,freq='7D')
        values=100+np.arange(90)+10*np.sin(np.arange(90))
        a=forecast(pd.Series(values,index=index))
        values[-1]=90000
        b=forecast(pd.Series(values,index=index))
        for left,right in zip(a['predictions'],b['predictions']):
            for name in ['previous_week','rolling_mean','seasonal','random_forest']:
                self.assertEqual(left[name],right[name])
        self.assertEqual(a['champion'],b['champion'])
        self.assertEqual(a['testWeeks'],8)

if __name__=='__main__':unittest.main()
