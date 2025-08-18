// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback } from "react";
import { observer } from "mobx-react";
import { Markdown } from "@/components/ui/markdown";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GlobalModel, GlobalCommandRunner } from "@/models";

const AlertModal: React.FC = observer(() => {
    const closeModal = useCallback(() => {
        GlobalModel.modalsModel.popModal(() => GlobalModel.cancelAlert());
    }, []);

    const handleOK = useCallback(() => {
        GlobalModel.confirmAlert();
    }, []);

    const handleDontShowAgain = useCallback((checked: boolean) => {
        const message = GlobalModel.alertMessage.get();
        if (message.confirmflag == null) {
            return;
        }
        GlobalCommandRunner.clientSetConfirmFlag(message.confirmflag, checked);
    }, []);

    const message = GlobalModel.alertMessage.get();
    const title = message?.title ?? (message?.confirm ? "Confirm" : "Alert");
    const isConfirm = message?.confirm ?? false;

    return (
        <Dialog open={true} onOpenChange={closeModal}>
            <DialogContent className="w-[500px] max-w-[90vw] bg-zinc-900 border-none">
                <DialogHeader>
                    <DialogTitle className="text-white">{title}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col px-5 gap-6 w-full">
                    {message?.markdown ? (
                        <Markdown text={message?.message ?? ""} className="text-gray-300" />
                    ) : (
                        <div className="text-gray-300">{message?.message}</div>
                    )}
                    {message?.confirmflag && (
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                onCheckedChange={handleDontShowAgain}
                                id="dont-show-again"
                                className="border-gray-700 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                            <label htmlFor="dont-show-again" className="text-sm text-gray-300">
                                Don't show me this again
                            </label>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    {isConfirm ? (
                        <>
                            <Button variant="outline" onClick={closeModal} className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700">
                                Cancel
                            </Button>
                            <Button autoFocus={true} onClick={handleOK} className="bg-blue-600 text-white hover:bg-blue-700">
                                Ok
                            </Button>
                        </>
                    ) : (
                        <Button autoFocus={true} onClick={handleOK} className="bg-blue-600 text-white hover:bg-blue-700">
                            Ok
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

export { AlertModal };