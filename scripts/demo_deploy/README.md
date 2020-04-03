## Deploying to the .220 server

When a new tag is cut, that tag needs to be deployed to the QA server.  To make this easier, run the following command from `/opt/skyline/claris/clsp-plugin`:

`./update.sh [git tag]`

e.g.

`./update.sh v0.16.4+17`

This will perform the following steps:

1. clone the project and checkout the tag in a directory with the same name as the tag
    1. e.g. `/opt/skyline/claris/clsp-plugin/v0.16.4+17`
1. symlink that tag directory to `app`
1. update `versions.html` with a link to that tag, so that old tags that have been deployed may be accessed

If this update script ever changes, it will need to be copied to `/opt/skyline/claris/clsp-plugin`
