import re
from unittest import TestCase

import aliyun_oss


class Test(TestCase):
    def test_generate_update_file_path(self):
        p1 = aliyun_oss.generate_update_file_path('D://abc.txt')
        self.assertTrue(re.match('knowledge/\d{4}/\d{2}/\d{13}\..*', p1))

    def test_upload_to_oss(self):
        path = './requirements.txt'
        result_path = aliyun_oss.upload_to_oss(path)
