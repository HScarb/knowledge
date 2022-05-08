#!/usr/bin/bash
import os
import re
from fnmatch import fnmatch

ROOT = '.'
SOURCE_FOLDERS = ['distributed', 'java', 'rabbitmq', 'rocketmq']
# SOURCE_FOLDERS = ['distributed']
FILE_PATTERN = '*.md'


def replace_img_url_in_file(file_path):
    """
    Replace local image url in markdown to github repo url

    :param file_path: file path of markdown file
    """
    with open(file_path, 'r', encoding='UTF-8') as f:
        lines = f.readlines()
        for line in lines:
            re_img_url = re.compile(r'!\[.*\]\((\..+/assets/.+)\)')
            match = re_img_url.match(line)
            if match:
                print(match.groups())


if __name__ == '__main__':
    for folder in SOURCE_FOLDERS:
        for path, subdirs, files in os.walk(folder):
            for name in files:
                if fnmatch(name, FILE_PATTERN):
                    file_path = os.path.join(path, name)
                    print('------' + file_path + '------')
                    replace_img_url_in_file(file_path)
