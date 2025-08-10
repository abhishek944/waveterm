import React, { useState, useRef, useCallback, useEffect } from "react";
import { GlobalModel } from "@/models";
import { Modal, PasswordField, TextField, Markdown, Checkbox } from "@/elements";

export const UserInputModal: React.FC<{ userInputRequest: UserInputRequest }> = ({ userInputRequest }) => {
    const [responseText, setResponseText] = useState("");
    const [countdown, setCountdown] = useState(Math.floor(userInputRequest.timeoutms / 1000));
    const checkboxStatus = useRef(false);

    const handleSendCancel = useCallback(() => {
        GlobalModel.sendUserInput({
            type: "userinputresp",
            requestid: userInputRequest.requestid,
            errormsg: "Canceled by the user",
        });
        GlobalModel.remotesModel.closeModal();
    }, [userInputRequest]);

    const handleSendText = useCallback(() => {
        GlobalModel.sendUserInput({
            type: "userinputresp",
            requestid: userInputRequest.requestid,
            text: responseText,
            checkboxstat: checkboxStatus.current,
        });
        GlobalModel.remotesModel.closeModal();
    }, [responseText, userInputRequest]);

    const handleSendConfirm = useCallback(
        (response: boolean) => {
            console.log(`checkbox ${checkboxStatus}\n\n`);
            GlobalModel.sendUserInput({
                type: "userinputresp",
                requestid: userInputRequest.requestid,
                confirm: response,
                checkboxstat: checkboxStatus.current,
            });
            GlobalModel.remotesModel.closeModal();
        },
        [userInputRequest]
    );

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        if (countdown === 0) {
            timeout = setTimeout(() => {
                GlobalModel.remotesModel.closeModal();
            }, 300);
        } else {
            timeout = setTimeout(() => {
                setCountdown(countdown - 1);
            }, 1000);
        }
        return () => clearTimeout(timeout);
    }, [countdown]);

    return (
        <Modal className="w-[500px]">
            <Modal.Header onClose={handleSendCancel} title={userInputRequest.title + ` (${countdown}s)`} />
            <div className="px-5 pb-0">
                <div className="py-5">
                    <div className="mb-2.5">
                        {userInputRequest.markdown ? (
                            <Markdown text={userInputRequest.querytext} className="mb-4" />
                        ) : (
                            userInputRequest.querytext
                        )}
                    </div>
                    {userInputRequest.responsetype === "text" && (
                        <>
                            {userInputRequest.publictext ? (
                                <TextField
                                    onChange={setResponseText}
                                    value={responseText}
                                    maxLength={400}
                                    autoFocus={true}
                                />
                            ) : (
                                <PasswordField
                                    onChange={setResponseText}
                                    value={responseText}
                                    maxLength={400}
                                    autoFocus={true}
                                />
                            )}
                        </>
                    )}
                </div>
                {userInputRequest.checkboxmsg !== "" && (
                    <Checkbox
                        onChange={() => (checkboxStatus.current = !checkboxStatus.current)}
                        label={userInputRequest.checkboxmsg}
                        className="checkbox-text"
                    />
                )}
            </div>
            {userInputRequest.responsetype === "text" ? (
                <Modal.Footer
                    onCancel={handleSendCancel}
                    onOk={handleSendText}
                    okLabel="Continue"
                    keybindings={true}
                />
            ) : userInputRequest.responsetype === "confirm" ? (
                <Modal.Footer
                    onCancel={() => handleSendConfirm(false)}
                    onOk={() => handleSendConfirm(true)}
                    okLabel="Yes"
                    cancelLabel="No"
                    keybindings={true}
                />
            ) : null}
        </Modal>
    );
};