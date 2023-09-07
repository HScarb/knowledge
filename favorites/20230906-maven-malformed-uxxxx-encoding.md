# [ERROR] Malformed \uxxxx encoding.

https://stackoverflow.com/questions/17043037/ant-malformed-uxxxx-encoding-in-propertyfile-task

---

go to your .m2 directory in home directory and for every dependence delete the "resolver-status.properties". You can do that using

find ~/.m2/ -name resolver-status.properties -delete
It will find all "resolver-status.properties" and -delete flag will delete them.

Now reload maven project.