#!/usr/bin/bash
import os
import re
import shutil
from datetime import datetime
from fnmatch import fnmatch

import aliyun_oss

ROOT = '.'
SOURCE_FOLDERS = ['java', 'rabbitmq', 'rocketmq']
# SOURCE_FOLDERS = ['distributed']
OUTPUT_FOLDER = '_output'
DOCS_FOLDER = os.path.join('docs', 'src')
FILE_PATTERN = '\d{8}.*\.md'

PREFIX = '''---
title: {title}
author: Scarb
date: {date}
---

'''
SUFFIX = '''

---

欢迎关注公众号【消息中间件】（middleware-mq），更新消息中间件的源码解析和最新动态！

![](https://scarb-images.oss-cn-hangzhou.aliyuncs.com/img/202205170102971.jpg)
'''


def find_first_line_start_with_in_file(file_path):
    """
    find first line start with '#' in file
    :param f:
    :return:
    """
    with open(file_path, 'r', encoding='UTF-8') as f:
        lines = f.readlines()
        for line in lines:
            if line.startswith('# '):
                return line[2:]


def _replace_image_path_to_github(line):
    pattern = r'!\[(.*)\]\(\.\.(/assets/.+)\)'
    re_img_url = re.compile(pattern)
    match = re_img_url.match(line)
    if match:
        l = re.sub(pattern=pattern,
                   repl='![\\1](https://raw.githubusercontent.com/HScarb/knowledge/master\\2)', string=line)
        return l
    else:
        return line


def _upload_local_image_to_oss(line):
    if line.startswith('[TOC]'):
        return '[[toc]]' + os.linesep
    pattern = r'!\[(.*)\]\(\.\./(assets/.+)\)'
    re_img_url = re.compile(pattern)
    match = re_img_url.match(line)
    if match:
        repl = '![\\1]({})'.format(aliyun_oss.upload_to_oss(match.groups()[1]))
        l = re.sub(pattern=pattern, repl=repl, string=line)
        return l
    else:
        return line


def convert_file_with_lambda(file_path, output_path, fn, prefix='', suffix=''):
    """
    Replace local image url in markdown to github repo url

    :param file_path: file path of markdown file
    """
    with open(file_path, 'r', encoding='UTF-8') as f, open(output_path, 'w', encoding='UTF-8') as f_out:
        lines = f.readlines()
        f_out.write(prefix)
        for line in lines:
            f_out.write(fn(line))
        f_out.write(suffix)


def recreate_dir(dir):
    try:
        shutil.rmtree(dir)
    except:
        pass
    os.mkdir(dir)


def generate_readme_for_dir(dir, folder):
    """
    generate vuepress README.md file for dir
    :return:
    """
    readme_path = os.path.join(dir, 'README.md')
    print(readme_path)
    with open(readme_path, 'w', encoding='UTF-8') as f:
        f.writelines('# {title}\n\n'.format(title=folder))

        for path, subdirs, files in os.walk(folder):
            for name in files:
                title = find_first_line_start_with_in_file(os.path.join(DOCS_FOLDER, folder, name)).strip()
                f.writelines('[{title}]({path})\n\n'.format(title=title, path=name))


def convert_image_url_to_output():
    """
    convert local image path to github url
    and export to _output folder
    :return:
    """
    for folder in SOURCE_FOLDERS:
        recreate_dir(os.path.join(OUTPUT_FOLDER, folder))
        recreate_dir(os.path.join(DOCS_FOLDER, folder))

        for path, subdirs, files in os.walk(folder):
            for name in files:
                if re.match(r'\d{8}.+?\.md', name):
                    # if fnmatch(name, FILE_PATTERN):
                    file_path = os.path.join(path, name)
                    output_path = os.path.join(OUTPUT_FOLDER, path, name)
                    docs_path = os.path.join(DOCS_FOLDER, path, name)
                    print('------' + file_path + '------')
                    convert_file_with_lambda(file_path, output_path, _replace_image_path_to_github, suffix=SUFFIX)
                    convert_file_with_lambda(file_path, docs_path, _upload_local_image_to_oss,
                                             prefix=PREFIX.format(
                                                 title=find_first_line_start_with_in_file(file_path).strip(),
                                                 date=datetime.strptime(name[0:8], '%Y%m%d').strftime(
                                                     '%Y-%m-%d')),
                                             suffix=SUFFIX)
        generate_readme_for_dir(os.path.join(DOCS_FOLDER, folder), folder)


if __name__ == '__main__':
    convert_image_url_to_output()
