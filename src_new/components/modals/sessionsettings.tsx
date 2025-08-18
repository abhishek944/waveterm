// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel, GlobalCommandRunner, Session } from "@/models";
import { commandRtnHandler } from "@/utils/util";
import { getTermThemes } from "@/utils/themeutil";
import * as util from "@/utils/util";
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
import { Switch } from "@/components/ui/toggle";
import { SettingsError } from "@/components/ui/settingserror";

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
        <Dialog open={true} onOpenChange={closeModal}>
            <DialogContent className="w-[720px] max-w-[90vw] bg-zinc-900 border-none">
                <DialogHeader>
                    <DialogTitle className="text-white">Workspace Settings</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col px-5 gap-6 w-full">
                    <div className="grid grid-cols-3 items-center gap-4">
                        <div className="col-span-1 text-gray-300">Name</div>
                        <div className="col-span-2">
                            <Input
                                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-blue-500"
                                value={session.name.get() ?? ""}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    handleInlineChangeName(val);
                                }}
                                maxLength={50}
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
                    {/* <div className="grid grid-cols-3 items-center gap-4">
                        <div className="col-span-1 flex items-center text-gray-300">
                            <div className="mr-2">Archived</div>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <i className="fa-sharp fa-regular fa-circle-question text-sm" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Archive will hide the workspace from the active menu. Commands and output will
                                        be retained, but hidden.
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <div className="col-span-2">
                            <Switch checked={session.archived.get()} onCheckedChange={handleChangeArchived} />
                        </div>
                    </div> */}
                    <div className="grid grid-cols-3 items-center gap-4">
                        <div className="col-span-1 text-gray-300">Actions</div>
                        <div className="col-span-2">
                            <Button onClick={handleDeleteSession} variant="destructive" size="sm">
                                Delete Workspace
                            </Button>
                        </div>
                    </div>
                    <SettingsError errorMessage={errorMessage} onDismiss={dismissError} />
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={closeModal}
                        className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                    >
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

export { SessionSettingsModal };
