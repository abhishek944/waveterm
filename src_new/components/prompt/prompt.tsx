// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { GlobalModel } from "@/models";
import { clsx } from "clsx";
import { isBlank } from "@/utils/util";

dayjs.extend(localizedFormat);

function makeFullRemoteRef(ownerName: string, remoteRef: string, name: string): string {
    if (isBlank(ownerName) && isBlank(name)) {
        return remoteRef;
    }
    if (!isBlank(ownerName) && isBlank(name)) {
        return ownerName + ":" + remoteRef;
    }
    if (isBlank(ownerName) && !isBlank(name)) {
        return remoteRef + ":" + name;
    }
    return ownerName + ":" + remoteRef + ":" + name;
}

function getRemoteStrWithAlias(rptr: RemotePtrType): string {
    if (rptr == null || isBlank(rptr.remoteid)) {
        return "(null)";
    }
    let remote = GlobalModel.getRemote(rptr.remoteid);
    if (remote == null) {
        return "(invalid)";
    }
    if (!isBlank(remote.remotealias)) {
        return `${remote.remotealias} (${remote.remotecanonicalname})`;
    }
    return `${remote.remotecanonicalname}`;
}

function getRemoteStr(rptr: RemotePtrType): string {
    if (rptr == null || isBlank(rptr.remoteid)) {
        return "(invalid remote)";
    }
    const username = isBlank(rptr.ownerid) ? null : GlobalModel.resolveUserIdToName(rptr.ownerid);
    const remoteRef = GlobalModel.resolveRemoteIdToRef(rptr.remoteid);
    const fullRef = makeFullRemoteRef(username, remoteRef, rptr.name);
    return fullRef;
}

function getShortVEnv(venvDir: string): string {
    if (isBlank(venvDir)) {
        return "";
    }
    const lastSlash = venvDir.lastIndexOf("/");
    if (lastSlash == -1) {
        return venvDir;
    }
    return venvDir.substring(lastSlash + 1);
}

function replaceHomePath(path: string, homeDir: string): string {
    if (path == homeDir) {
        return "~";
    }
    if (path.startsWith(homeDir + "/")) {
        return "~" + path.substring(homeDir.length);
    }
    return path;
}

function getCwdStr(remote: RemoteType, state: Record<string, string>): string {
    if (state == null || isBlank(state.cwd)) {
        return "~";
    }
    let cwd = state.cwd;
    if (remote?.remotevars.home) {
        cwd = replaceHomePath(cwd, remote.remotevars.home);
    }
    return cwd;
}

export const Prompt = observer(
    ({
        rptr,
        festate,
        color,
        shellInitMsg,
    }: {
        rptr: RemotePtrType;
        festate: Record<string, string>;
        color: boolean;
        shellInitMsg?: string;
    }) => {
        const getRemote = () => {
            const remote = GlobalModel.getRemote(rptr.remoteid);
            return remote;
        };

        const getRemoteElem = () => {
            const remoteStr = getRemoteStr(rptr);
            let remoteTitle: string = null;
            let isRoot = false;
            let remote = getRemote();
            if (remote?.remotevars) {
                if (remote.remotevars["sudo"] || remote.remotevars["bestuser"] == "root") {
                    isRoot = true;
                }
            }
            let remoteColorClass = isRoot ? "text-red-500" : "text-green-500";
            if (remote?.remoteopts?.color) {
                remoteColorClass = "color-" + remote.remoteopts.color;
            }
            if (remote?.remotecanonicalname) {
                remoteTitle = "connected to " + remote.remotecanonicalname;
            }
            let remoteElem = null;
            if (remoteStr != "local") {
                remoteElem = (
                    <span title={remoteTitle} className={clsx("term-prompt-remote", remoteColorClass)}>
                        [{remoteStr}]{" "}
                    </span>
                );
            }
            return { remoteElem, isRoot };
        };

        if (rptr == null || isBlank(rptr.remoteid)) {
            return <span className={clsx("term-prompt", "text-green-500")}>&nbsp;</span>;
        }

        let { remoteElem, isRoot } = getRemoteElem();
        const isDark = GlobalModel.isDarkTheme.get();
        let termClassNames = clsx("term-prompt font-mono text-gray-400", {
            "dark:text-white": isDark,
            "light:text-black": !isDark,
        });

        if (shellInitMsg != null) {
            return (
                <span className={termClassNames}>
                    {remoteElem}{" "}
                    <span className={clsx("term-prompt-shellmsg", { "dark:text-green-300": isDark })}>
                        {shellInitMsg}
                    </span>
                </span>
            );
        }

        const remote = getRemote();
        const cwd = getCwdStr(remote, festate);
        const cwdElem = (
            <span
                className={clsx("term-prompt-cwd", {
                    "dark:text-green-300": isDark && !isRoot,
                    "text-red-500": isRoot,
                })}
            >
                {cwd}
            </span>
        );
        let branchElem = null;
        let pythonElem = null;
        let condaElem = null;
        let k8sElem = null;

        if (!isBlank(festate["PROMPTVAR_GITBRANCH"])) {
            const branchName = festate["PROMPTVAR_GITBRANCH"];
            branchElem = (
                <span
                    title="current git branch"
                    className={clsx("term-prompt-branch", { "dark:text-white": isDark, "text-black": !isDark })}
                >
                    git:({branchName}){" "}
                </span>
            );
        }

        if (!isBlank(festate["VIRTUAL_ENV"])) {
            const venvDir = festate["VIRTUAL_ENV"];
            const venv = getShortVEnv(venvDir);
            pythonElem = (
                <span title="python venv" className="term-prompt-python text-purple-400">
                    venv:({venv}){" "}
                </span>
            );
        }

        if (!isBlank(festate["CONDA_DEFAULT_ENV"])) {
            const condaEnv = festate["CONDA_DEFAULT_ENV"];
            condaElem = (
                <span title="conda env" className="term-prompt-python text-purple-400">
                    conda:({condaEnv}){" "}
                </span>
            );
        }

        return (
            <span className={termClassNames}>
                {remoteElem} {cwdElem} {branchElem} {condaElem} {pythonElem} {k8sElem}
            </span>
        );
    }
);

export { getRemoteStr, getRemoteStrWithAlias };