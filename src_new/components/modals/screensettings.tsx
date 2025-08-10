// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { clsx } from "clsx";
import { GlobalModel, GlobalCommandRunner, Screen } from "@/models";
import { SettingsError, Modal, Dropdown, Tooltip } from "@/elements";
import * as util from "@/util/util";
import { Button } from "@/elements";
import { commandRtnHandler } from "@/util/util";
import { getTermThemes } from "@/util/themeutil";
import {
    TabColorSelector,
    TabIconSelector,
    TabNameTextField,
    TabRemoteSelector,
} from "@/app/workspace/screen/newtabsettings";

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
        <Modal className="w-[640px]">
            <Modal.Header onClose={closeModal} title={`Tab Settings (${screen.name.get()})`} />
            <div className="flex flex-col px-5 gap-1 w-full">
                <div className="settings-field">
                    <div className="settings-label">Name</div>
                    <div className="settings-input">
                        <TabNameTextField screen={screen} errorMessage={{ get: () => errorMessage, set: setErrorMessage } as any} />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Connection</div>
                    <div className="settings-input">
                        <TabRemoteSelector screen={screen} errorMessage={{ get: () => errorMessage, set: setErrorMessage } as any} />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Tab Color</div>
                    <div className="settings-input">
                        <TabColorSelector screen={screen} errorMessage={{ get: () => errorMessage, set: setErrorMessage } as any} />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label">Tab Icon</div>
                    <div className="settings-input">
                        <TabIconSelector screen={screen} errorMessage={{ get: () => errorMessage, set: setErrorMessage } as any} />
                    </div>
                </div>
                {termThemes.length > 0 && (
                    <div className="settings-field">
                        <div className="settings-label">Terminal Theme</div>
                        <div className="settings-input">
                            <Dropdown
                                className="terminal-theme-dropdown"
                                options={termThemes}
                                defaultValue={currTermTheme}
                                onChange={handleChangeTermTheme}
                            />
                        </div>
                    </div>
                )}
                <div className="settings-field">
                    <div className="settings-label flex items-center">
                        <div className="mr-[5px]">Actions</div>
                        <Tooltip
                            message={`Delete will remove the tab, removing all commands and output.`}
                            icon={<i className="fa-sharp fa-regular fa-circle-question text-[13px]" />}
                            className="screen-settings-tooltip"
                        >
                            <i className="fa-sharp fa-regular fa-circle-question text-[13px]" />
                        </Tooltip>
                    </div>
                    <div className="settings-input">
                        <Button onClick={handleDeleteScreen} className="secondary small danger">
                            Delete Tab
                        </Button>
                    </div>
                </div>
                <SettingsError errorMessage={errorMessage} />
            </div>
            <Modal.Footer cancelLabel="Close" onCancel={closeModal} keybindings={true} />
        </Modal>
    );
});

export { ScreenSettingsModal };