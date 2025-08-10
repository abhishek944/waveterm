// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback } from "react";
import { observer } from "mobx-react";
import { Markdown, Modal, Button, Checkbox } from "@/elements";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { ModalKeybindings } from "../elements/modal";

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
        <Modal className="w-[500px]">
            <Modal.Header onClose={closeModal} title={title} keybindings={true} />
            <div className="px-5 py-10">
                {message?.markdown ? (
                    <Markdown text={message?.message ?? ""} extraClassName="mb-4" />
                ) : (
                    <div>{message?.message}</div>
                )}
                {message?.confirmflag && (
                    <Checkbox
                        onChange={handleDontShowAgain}
                        label="Don't show me this again"
                        className="text-sm"
                    />
                )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                {isConfirm ? (
                    <>
                        <ModalKeybindings onOk={handleOK} onCancel={closeModal} />
                        <Button className="secondary" onClick={closeModal}>
                            Cancel
                        </Button>
                        <Button autoFocus={true} onClick={handleOK}>
                            Ok
                        </Button>
                    </>
                ) : (
                    <>
                        <ModalKeybindings onOk={handleOK} onCancel={null} />
                        <Button autoFocus={true} onClick={handleOK}>
                            Ok
                        </Button>
                    </>
                )}
            </div>
        </Modal>
    );
});

export { AlertModal };