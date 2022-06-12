import re
from unittest import TestCase

import config
import convert


class Test(TestCase):
    def test__upload_local_image_to_oss(self):
        result_path = convert._upload_local_image_to_oss('![](../assets/delay_msg_new_pattern.drawio.png)')
        pattern = '!\[\]\(' + config.ACCESS_URL + 'knowledge/\d{4}/\d{2}/\d{13}\.png\)'
        self.assertTrue(re.match(pattern, result_path))
