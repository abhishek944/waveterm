// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel, GlobalCommandRunner, RemotesModel } from "@/models";
import * as util from "@/utils/util";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
} from "@/components/ui/modal";
import { TextField } from "@/components/ui/textfield";
import { InputDecoration } from "@/components/ui/inputdecoration";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PasswordField } from "@/components/ui/passwordfield";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const CreateRemoteConnModal: React.FC = observer(() => {
    const model = GlobalModel.remotesModel;
    const remoteEdit = model.remoteEdit.get();
    
    const [tempAlias, setTempAlias] = useState("");
    const [tempHostName, setTempHostName] = useState("");
    const [tempPort, setTempPort] = useState("");
    const [tempAuthMode, setTempAuthMode] = useState("none");
    const [tempConnectMode, setTempConnectMode] = useState("auto");
    const [tempPassword, setTempPassword] = useState("");
    const [tempKeyFile, setTempKeyFile] = useState("");
    const [tempShellPref, setTempShellPref] = useState("detect");
    const [errorStr, setErrorStr] = useState(remoteEdit?.errorstr ?? null);

    useEffect(() => {
        GlobalModel.getClientData();
    }, []);

    const remoteCName = (): string => {
        let hostName = tempHostName;
        if (hostName === "") {
            return "[no host]";
        }
        if (hostName.indexOf("@") === -1) {
            hostName = "[no user]@" + hostName;
        }
        return hostName;
    };

    const getErrorStr = (): string => {
        if (errorStr != null) {
            return errorStr;
        }
        return remoteEdit?.errorstr ?? null;
    };

    const handleSubmitRemote = async () => {
        setErrorStr(null);
        const authMode = tempAuthMode;
        const cname = tempHostName;
        
        if (cname === "") {
            setErrorStr("You must specify a 'user@host' value to create a new connection");
            return;
        }
        
        const kwargs: Record<string, string> = {};
        kwargs["alias"] = tempAlias;
        
        if (tempPort !== "" && tempPort !== "22") {
            kwargs["port"] = tempPort;
        }
        
        if (authMode === "key" || authMode === "key+password") {
            if (tempKeyFile === "") {
                setErrorStr("When AuthMode is set to 'key', you must supply a valid key file name.");
                return;
            }
            kwargs["key"] = tempKeyFile;
        } else {
            kwargs["key"] = "";
        }
        
        if (authMode === "password" || authMode === "key+password") {
            if (tempPassword === "") {
                setErrorStr("When AuthMode is set to 'password', you must supply a password.");
                return;
            }
            kwargs["password"] = tempPassword;
        } else {
            kwargs["password"] = "";
        }
        
        kwargs["connectmode"] = tempConnectMode;
        kwargs["shellpref"] = tempShellPref;
        kwargs["visual"] = "1";
        kwargs["submit"] = "1";
        
        try {
            const crtn = await GlobalCommandRunner.createRemote(cname, kwargs, false);
            if (crtn.success) {
                model.setRecentConnAdded(true);
                model.closeModal();

                if (GlobalModel.activeMainView.get() === "session") {
                    const crcrtn = await GlobalCommandRunner.screenSetRemote(cname, true, true);
                    if (!crcrtn.success) {
                        setErrorStr(crcrtn.error);
                    }
                }
            } else {
                setErrorStr(crtn.error);
            }
        } catch (e) {
            setErrorStr(e.message);
        }
    };

    if (remoteEdit == null) {
        return null;
    }

    return (
        <Dialog open={true} onOpenChange={model.closeModal}>
            <DialogContent className="w-[452px] min-h-[411px]">
                <DialogHeader>
                    <DialogTitle>Add Connection</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col px-5 gap-3 w-full">
                        <div className="w-full">
                            <TextField
                                label="user@host"
                                autoFocus={true}
                                value={tempHostName}
                                onChange={(e) => setTempHostName(e.target.value)}
                                required={true}
                                decoration={{
                                    endDecoration: (
                                        <InputDecoration>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <i className="fa-sharp fa-regular fa-circle-question" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {`(Required) The user and host that you want to connect with. This is in the same format as
                                                        you would pass to ssh, e.g. "ubuntu@test.mydomain.com".`}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </InputDecoration>
                                    ),
                                }}
                            />
                        </div>
                        <div className="w-full">
                            <TextField
                                label="Alias"
                                onChange={(e) => setTempAlias(e.target.value)}
                                value={tempAlias}
                                maxLength={100}
                                decoration={{
                                    endDecoration: (
                                        <InputDecoration>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <i className="fa-sharp fa-regular fa-circle-question" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {`(Optional) A short alias to use when selecting or displaying this connection.`}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </InputDecoration>
                                    ),
                                }}
                            />
                        </div>
                        <div className="w-full">
                            <TextField
                                label="Port"
                                placeholder="22"
                                value={tempPort}
                                onChange={(e) => setTempPort(e.target.value)}
                                decoration={{
                                    endDecoration: (
                                        <InputDecoration>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <i className="fa-sharp fa-regular fa-circle-question" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {`(Optional) Defaults to 22. Set if the server you are connecting to listens to a non-standard
                                                        SSH port.`}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </InputDecoration>
                                    ),
                                }}
                            />
                        </div>
                        <div className="w-full">
                            <Label>Auth Mode</Label>
                            <Select onValueChange={setTempAuthMode} defaultValue={tempAuthMode}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select auth mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">none</SelectItem>
                                    <SelectItem value="key">key</SelectItem>
                                    <SelectItem value="password">password</SelectItem>
                                    <SelectItem value="key+password">key+passphrase</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {(tempAuthMode === "key" || tempAuthMode === "key+password") && (
                            <TextField
                                label="SSH Keyfile"
                                placeholder="keyfile path"
                                onChange={(e) => setTempKeyFile(e.target.value)}
                                value={tempKeyFile}
                                maxLength={400}
                                required={true}
                                decoration={{
                                    endDecoration: (
                                        <InputDecoration>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <i className="fa-sharp fa-regular fa-circle-question" />
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {`(Required) The path to your ssh private key file.`}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </InputDecoration>
                                    ),
                                }}
                            />
                        )}
                        {(tempAuthMode === "password" || tempAuthMode === "key+password") && (
                            <PasswordField
                                placeholder={tempAuthMode === "password" ? "SSH Password" : "Key Passphrase"}
                                onChange={(e) => setTempPassword(e.target.value)}
                                value={tempPassword}
                                maxLength={400}
                            />
                        )}
                        <div className="w-full">
                            <Label>Connect Mode</Label>
                            <Select onValueChange={setTempConnectMode} defaultValue={tempConnectMode}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select connect mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="startup">startup</SelectItem>
                                    <SelectItem value="auto">auto</SelectItem>
                                    <SelectItem value="manual">manual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-full">
                            <Label>Shell Preference</Label>
                            <Select onValueChange={setTempShellPref} defaultValue={tempShellPref}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select shell preference" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="detect">detect</SelectItem>
                                    <SelectItem value="bash">bash</SelectItem>
                                    <SelectItem value="zsh">zsh</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {!util.isBlank(getErrorStr() as string) && (
                            <div className="text-red-500 text-sm">Error: {getErrorStr()}</div>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={model.closeModal}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmitRemote}>Connect</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

export { CreateRemoteConnModal };