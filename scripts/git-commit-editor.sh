#!/bin/sh
# Commit messages are authored by cz-git. Git still invokes $GIT_EDITOR
# (and $GIT_SEQUENCE_EDITOR for rebase -i); exit so Cursor never opens a tab.
exit 0
