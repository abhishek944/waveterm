import React, { useState, useRef, useCallback, useEffect } from "react";
import { GlobalModel } from "@/models";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/modal";
import { PasswordField } from "@/components/ui/passwordfield";
import { TextField } from "@/components/ui/textfield";
import { Markdown } from "@/components/ui/markdown";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

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
        <Dialog open={true} onOpenChange={handleSendCancel}>
            <DialogContent className="w-[500px]">
                <DialogHeader>
                    <DialogTitle>{userInputRequest.title + ` (${countdown}s)`}</DialogTitle>
                </DialogHeader>
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
                                        onChange={(e) => setResponseText(e.target.value)}
                                        value={responseText}
                                        maxLength={400}
                                        autoFocus={true}
                                    />
                                ) : (
                                    <PasswordField
                                        onChange={(e) => setResponseText(e.target.value)}
                                        value={responseText}
                                        maxLength={400}
                                        autoFocus={true}
                                    />
                                )}
                            </>
                        )}
                    </div>
                    {userInputRequest.checkboxmsg !== "" && (
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                onCheckedChange={() => (checkboxStatus.current = !checkboxStatus.current)}
                                id="user-input-checkbox"
                            />
                            <label htmlFor="user-input-checkbox">{userInputRequest.checkboxmsg}</label>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    {userInputRequest.responsetype === "text" ? (
                        <>
                            <Button variant="outline" onClick={handleSendCancel}>
                                Cancel
                            </Button>
                            <Button onClick={handleSendText}>Continue</Button>
                        </>
                    ) : userInputRequest.responsetype === "confirm" ? (
                        <>
                            <Button variant="outline" onClick={() => handleSendConfirm(false)}>
                                No
                            </Button>
                            <Button onClick={() => handleSendConfirm(true)}>Yes</Button>
                        </>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};