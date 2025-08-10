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
            <DialogContent className="w-[500px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="px-5 py-10">
                    {message?.markdown ? (
                        <Markdown text={message?.message ?? ""} className="mb-4" />
                    ) : (
                        <div>{message?.message}</div>
                    )}
                    {message?.confirmflag && (
                        <div className="flex items-center space-x-2 mt-4">
                            <Checkbox
                                onCheckedChange={handleDontShowAgain}
                                id="dont-show-again"
                            />
                            <label htmlFor="dont-show-again" className="text-sm">
                                Don't show me this again
                            </label>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    {isConfirm ? (
                        <>
                            <Button variant="outline" onClick={closeModal}>
                                Cancel
                            </Button>
                            <Button autoFocus={true} onClick={handleOK}>
                                Ok
                            </Button>
                        </>
                    ) : (
                        <Button autoFocus={true} onClick={handleOK}>
                            Ok
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

export { AlertModal };