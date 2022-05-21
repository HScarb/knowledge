#!/usr/bin/bash
import os
import re
import shutil
from fnmatch import fnmatch

ROOT = '.'
SOURCE_FOLDERS = ['distributed', 'java', 'rabbitmq', 'rocketmq']
# SOURCE_FOLDERS = ['distributed']
OUTPUT_FOLDER = '_output'
FILE_PATTERN = '*.md'

SUFFIX = '''

---

欢迎关注公众号【消息中间件】，更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
'''

def replace_img_url_in_file(file_path, output_path):
    """
    Replace local image url in markdown to github repo url

    :param file_path: file path of markdown file
    """
    with open(file_path, 'r', encoding='UTF-8') as f, open(output_path, 'w', encoding='UTF-8') as f_out:
        lines = f.readlines()
        for line in lines:
            re_img_url = re.compile(r'!\[(.*)\]\(\.\.(/assets/.+)\)')
            match = re_img_url.match(line)
            if match:
                l = re.sub(pattern=r'!\[(.*)\]\(\.\.(/assets/.+)\)',
                             repl='![\\1](https://raw.githubusercontent.com/HScarb/knowledge/master\\2)', string=line)
                f_out.write(l)
            else:
                f_out.write(line)
        f_out.write(SUFFIX)


if __name__ == '__main__':
    try:
        shutil.rmtree(OUTPUT_FOLDER)
    except:
        pass
    os.mkdir(OUTPUT_FOLDER)

    for folder in SOURCE_FOLDERS:
        os.mkdir(os.path.join(OUTPUT_FOLDER, folder))
        for path, subdirs, files in os.walk(folder):
            for name in files:
                if fnmatch(name, FILE_PATTERN):
                    file_path = os.path.join(path, name)
                    output_path = os.path.join(OUTPUT_FOLDER, path, name)
                    print('------' + file_path + '------')
                    replace_img_url_in_file(file_path, output_path)
