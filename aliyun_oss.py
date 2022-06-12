# 首先初始化AccessKeyId、AccessKeySecret、Endpoint等信息。
# 通过环境变量获取，或者把诸如“<你的AccessKeyId>”替换成真实的AccessKeyId等。
#
# 以杭州区域为例，Endpoint可以是：
#   http://oss-cn-hangzhou.aliyuncs.com
#   https://oss-cn-hangzhou.aliyuncs.com
# 分别以HTTP、HTTPS协议访问。
import json
import os
import time
from datetime import datetime

import oss2

import config

access_key_id = os.getenv('OSS_TEST_ACCESS_KEY_ID', config.AK)
access_key_secret = os.getenv('OSS_TEST_ACCESS_KEY_SECRET', config.SK)
bucket_name = os.getenv('OSS_TEST_BUCKET', config.BUCKET_NAME)
endpoint = os.getenv('OSS_TEST_ENDPOINT', config.ENDPOINT)
prefix = 'knowledge'

# 创建Bucket对象，所有Object相关的接口都可以通过Bucket对象来进行
bucket = oss2.Bucket(oss2.Auth(access_key_id, access_key_secret), endpoint, bucket_name)

with open('oss_cache.json', 'r') as f:
    oss_cache = json.loads(f.read())


def generate_update_file_path(path):
    current_year = datetime.now().year
    current_month = datetime.now().month
    current_timestamp = int(round(time.time() * 1000))
    extension = os.path.splitext(path)[-1]
    ret = '/'.join([prefix, str(current_year), '{:0>2d}'.format(current_month), str(current_timestamp)])
    return ret + extension


def upload_to_oss(full_path):
    if full_path in oss_cache:
        return oss_cache.get(full_path)
    upload_path = generate_update_file_path(full_path)
    with open(oss2.to_unicode(full_path), 'rb') as f:
        result = bucket.put_object(upload_path, f)
        if result.resp.status == 200:
            access_path = config.ACCESS_URL + upload_path
            print(access_path)
            oss_cache.setdefault(full_path, access_path)
            with open('oss_cache.json', 'w+') as oss_f:
                oss_f.write(json.dumps(oss_cache))
            return access_path
        else:
            raise Exception('Upload ' + full_path + ' to OSS failed.')
