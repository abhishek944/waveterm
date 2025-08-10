// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel, GlobalCommandRunner, Session } from "@/models";
import { Toggle, InlineSettingsTextEdit, SettingsError, Modal, Tooltip, Button, Dropdown } from "@/elements";
import { commandRtnHandler } from "@/util/util";
import { getTermThemes } from "@/util/themeutil";
import * as util from "@/util/util";

const SessionDeleteMessage = `
Are you sure you want to delete this workspace?
`.trim();

const SessionSettingsModal: React.FC = observer(() => {
    const [errorMessage, setErrorMessage] = useState<string>(null);
    const sessionId = GlobalModel.sessionSettingsModal.get();
    const session = GlobalModel.getSessionById(sessionId);

    const closeModal = (): void => {
        action(() => {
            GlobalModel.sessionSettingsModal.set(null);
        })();
        GlobalModel.modalsModel.popModal();
    };

    const handleInlineChangeName = (newVal: string): void => {
        if (session == null) {
            return;
        }
        if (util.isStrEq(newVal, session.name.get())) {
            return;
        }
        const prtn = GlobalCommandRunner.sessionSetSettings(sessionId, { name: newVal }, false);
        util.commandRtnHandler(prtn, { set: setErrorMessage } as any);
    };

    const handleChangeArchived = (val: boolean): void => {
        if (session == null) {
            return;
        }
        if (session.archived.get() === val) {
            return;
        }
        const prtn = GlobalCommandRunner.sessionArchive(sessionId, val);
        util.commandRtnHandler(prtn, { set: setErrorMessage } as any);
    };

    const handleDeleteSession = async (): Promise<void> => {
        const message = SessionDeleteMessage;
        const result = await GlobalModel.showAlert({ message: message, confirm: true, markdown: true });
        if (!result) {
            return;
        }
        const prtn = GlobalCommandRunner.sessionDelete(sessionId);
        util.commandRtnHandler(prtn, { set: setErrorMessage } as any, () => GlobalModel.modalsModel.popModal());
    };

    const handleChangeTermTheme = (theme: string): void => {
        const currTheme = GlobalModel.getTermThemeSettings()[sessionId];
        if (currTheme === theme) {
            return;
        }
        const prtn = GlobalCommandRunner.setSessionTermTheme(sessionId, theme, false);
        commandRtnHandler(prtn, { set: setErrorMessage } as any);
    };

    const dismissError = (): void => {
        setErrorMessage(null);
    };

    if (session == null) {
        return null;
    }

    const termThemes = getTermThemes(GlobalModel.termThemes.get());
    const currTermTheme = GlobalModel.getTermThemeSettings()[sessionId] ?? termThemes[0]?.label;

    return (
        <Modal className="w-[640px]">
            <Modal.Header onClose={closeModal} title={`Workspace Settings (${session.name.get()})`} />
            <div className="flex flex-col px-5 gap-1 w-full">
                <div className="settings-field">
                    <div className="settings-label">Name</div>
                    <div className="settings-input">
                        <InlineSettingsTextEdit
                            placeholder="name"
                            text={session.name.get() ?? "(none)"}
                            value={session.name.get() ?? ""}
                            onChange={handleInlineChangeName}
                            maxLength={50}
                            showIcon={true}
                        />
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
                        <div className="mr-[5px]">Archived</div>
                        <Tooltip
                            className="session-settings-tooltip"
                            message="Archive will hide the workspace from the active menu. Commands and output will be
                            retained, but hidden."
                            icon={<i className="fa-sharp fa-regular fa-circle-question text-[12px] ml-[0.5px]" />}
                        >
                            <i className="fa-sharp fa-regular fa-circle-question text-[12px] ml-[0.5px]" />
                        </Tooltip>
                    </div>
                    <div className="settings-input">
                        <Toggle checked={session.archived.get()} onChange={handleChangeArchived} />
                    </div>
                </div>
                <div className="settings-field">
                    <div className="settings-label flex items-center">
                        <div className="mr-[5px]">Actions</div>
                        <Tooltip
                            className="session-settings-tooltip"
                            message="Delete will remove the workspace, deleting all commands and output."
                            icon={<i className="fa-sharp fa-regular fa-circle-question text-[12px] ml-[0.5px]" />}
                        >
                            <i className="fa-sharp fa-regular fa-circle-question text-[12px] ml-[0.5px]" />
                        </Tooltip>
                    </div>
                    <div className="settings-input">
                        <Button onClick={handleDeleteSession} className="secondary small danger">
                            Delete Workspace
                        </Button>
                    </div>
                </div>
                <SettingsError errorMessage={errorMessage} />
            </div>
            <Modal.Footer cancelLabel="Close" onCancel={closeModal} keybindings={true} />
        </Modal>
    );
});

export { SessionSettingsModal };