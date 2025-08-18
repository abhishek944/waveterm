// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel, GlobalCommandRunner, Screen } from "@/models";
import * as util from "@/utils/util";
import { commandRtnHandler } from "@/utils/util";
import { getTermThemes } from "@/utils/themeutil";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/modal";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingsError } from "@/components/ui/settingserror";
import {
    TabColorSelector,
    TabIconSelector,
    TabRemoteSelector,
} from "@/components/workspace/screen/newtabsettings";

const ScreenDeleteMessage = `
Are you sure you want to delete this tab?
`.trim();

const WebShareConfirmMarkdown = `
You are about to share a terminal tab on the web.  Please make sure that you do
NOT share any private information, keys, passwords, or other sensitive information.
You are responsible for what you are sharing, be smart.
`.trim();

const WebStopShareConfirmMarkdown = `
Are you sure you want to stop web-sharing this tab?
`.trim();

const ScreenSettingsModal: React.FC = observer(() => {
    const [shareCopied, setShareCopied] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>(null);
    
    const screenSettingsModal = GlobalModel.screenSettingsModal.get();
    if (!screenSettingsModal) return null;
    
    const { sessionId, screenId } = screenSettingsModal;
    const screen = GlobalModel.getScreenById(sessionId, screenId);
    const remotes = GlobalModel.remotes;

    if (screen == null || sessionId == null || screenId == null) {
        return null;
    }

    const getOptions = (): { label: string; value: string }[] => {
        return remotes
            .filter((r) => !r.archived)
            .map((remote) => ({
                ...remote,
                label: !util.isBlank(remote.remotealias)
                    ? `${remote.remotealias} - ${remote.remotecanonicalname}`
                    : remote.remotecanonicalname,
                value: remote.remotecanonicalname,
            }))
            .sort((a, b) => {
                const connValA = util.getRemoteConnVal(a);
                const connValB = util.getRemoteConnVal(b);
                if (connValA !== connValB) {
                    return connValA - connValB;
                }
                return a.remoteidx - b.remoteidx;
            });
    };

    const closeModal = (): void => {
        action(() => {
            GlobalModel.screenSettingsModal.set(null);
        })();
        GlobalModel.modalsModel.popModal();
    };

    const handleChangeWebShare = async (val: boolean): Promise<void> => {
        if (screen == null) {
            return;
        }
        if (screen.isWebShared() === val) {
            return;
        }
        const message = val ? WebShareConfirmMarkdown : WebStopShareConfirmMarkdown;
        const result = await GlobalModel.showAlert({ message: message, confirm: true, markdown: true });
        if (!result) {
            return;
        }
        const prtn = GlobalCommandRunner.screenWebShare(screen.screenId, val);
        util.commandRtnHandler(prtn, { set: setErrorMessage } as any);
    };

    const copyShareLink = (): void => {
        if (screen == null) {
            return;
        }
        const shareLink = screen.getWebShareUrl();
        if (shareLink == null) {
            return;
        }
        navigator.clipboard.writeText(shareLink);
        setShareCopied(true);
        setTimeout(() => {
            setShareCopied(false);
        }, 600);
    };

    const dismissError = (): void => {
        setErrorMessage(null);
    };

    const handleDeleteScreen = async (): Promise<void> => {
        if (screen == null) {
            return;
        }
        if (screen.getScreenLines().lines.length === 0) {
            GlobalCommandRunner.screenDelete(screenId, false);
            GlobalModel.modalsModel.popModal();
            return;
        }
        const message = ScreenDeleteMessage;
        const result = await GlobalModel.showAlert({ message: message, confirm: true, markdown: true });
        if (!result) {
            return;
        }
        const prtn = GlobalCommandRunner.screenDelete(screenId, false);
        util.commandRtnHandler(prtn, { set: setErrorMessage } as any);
        GlobalModel.modalsModel.popModal();
    };

    const handleChangeTermTheme = (theme: string): void => {
        const currTheme = GlobalModel.getTermThemeSettings()[screenId];
        if (currTheme === theme) {
            return;
        }
        const prtn = GlobalCommandRunner.setScreenTermTheme(screenId, theme, false);
        commandRtnHandler(prtn, { set: setErrorMessage } as any);
    };

    const selectRemote = (cname: string): void => {
        const prtn = GlobalCommandRunner.screenSetRemote(cname, true, false);
        util.commandRtnHandler(prtn, { set: setErrorMessage } as any);
    };

    const termThemes = getTermThemes(GlobalModel.termThemes.get());
    const currTermTheme = GlobalModel.getTermThemeSettings()[screenId] ?? termThemes[0]?.label;

    return (
        <Dialog open={true} onOpenChange={closeModal}>
            <DialogContent className="w-[720px] max-w-[90vw] bg-zinc-900 border-none">
                <DialogHeader>
                    <DialogTitle className="text-white">Tab Settings</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col px-5 gap-6 w-full">
                    <div className="grid grid-cols-3 items-center gap-4">
                        <div className="col-span-1 text-gray-300">Name</div>
                        <div className="col-span-2">
                            <Input
                                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-blue-500"
                                value={screen.name.get() ?? ""}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (util.isStrEq(val, screen.name.get())) {
                                        return;
                                    }
                                    const prtn = GlobalCommandRunner.screenSetSettings(screen.screenId, { name: val }, false);
                                    util.commandRtnHandler(prtn, { set: setErrorMessage } as any);
                                }}
                            />
                        </div>
                    </div>
                    {/* <div className="grid grid-cols-3 items-center gap-4">
                        <div className="col-span-1 text-gray-300">Connection</div>
                        <div className="col-span-2">
                            <TabRemoteSelector
                                screen={screen}
                                errorMessage={{ get: () => errorMessage, set: setErrorMessage } as any}
                            />
                        </div>
                    </div> */}
                    <div className="grid grid-cols-3 items-center gap-4">
                        <div className="col-span-1 text-gray-300">Tab Color</div>
                        <div className="col-span-2">
                            <TabColorSelector
                                screen={screen}
                                errorMessage={{ get: () => errorMessage, set: setErrorMessage } as any}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                        <div className="col-span-1 text-gray-300">Tab Icon</div>
                        <div className="col-span-2">
                            <TabIconSelector
                                screen={screen}
                                errorMessage={{ get: () => errorMessage, set: setErrorMessage } as any}
                            />
                        </div>
                    </div>
                    {/* {termThemes.length > 0 && (
                        <div className="grid grid-cols-3 items-center gap-4">
                            <div className="col-span-1 text-gray-300">Terminal Theme</div>
                            <div className="col-span-2">
                                <Select onValueChange={handleChangeTermTheme} defaultValue={currTermTheme}>
                                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                                        <SelectValue placeholder="Select a theme" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-700">
                                        {termThemes.map((theme) => (
                                            <SelectItem key={theme.value} value={theme.value} className="text-white hover:bg-gray-700">
                                                {theme.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )} */}
                    <div className="grid grid-cols-3 items-center gap-4">
                        <div className="col-span-1 text-gray-300">Actions</div>
                        <div className="col-span-2">
                            <Button onClick={handleDeleteScreen} variant="destructive" size="sm">
                                Delete Tab
                            </Button>
                        </div>
                    </div>
                    <SettingsError errorMessage={errorMessage} onDismiss={dismissError} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={closeModal} className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700">
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

export { ScreenSettingsModal };