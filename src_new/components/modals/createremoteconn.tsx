// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel, GlobalCommandRunner, RemotesModel } from "@/models";
import { Modal, TextField, InputDecoration, Dropdown, PasswordField, Tooltip } from "@/elements";
import * as util from "@/util/util";

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
        <Modal className="w-[452px] min-h-[411px]">
            <Modal.Header title="Add Connection" onClose={model.closeModal} />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col px-5 gap-3 w-full">
                    <div className="w-full">
                        <TextField
                            label="user@host"
                            autoFocus={true}
                            value={tempHostName}
                            onChange={setTempHostName}
                            required={true}
                            decoration={{
                                endDecoration: (
                                    <InputDecoration>
                                        <Tooltip
                                            message={`(Required) The user and host that you want to connect with. This is in the same format as
													you would pass to ssh, e.g. "ubuntu@test.mydomain.com".`}
                                            icon={<i className="fa-sharp fa-regular fa-circle-question" />}
                                        >
                                            <i className="fa-sharp fa-regular fa-circle-question" />
                                        </Tooltip>
                                    </InputDecoration>
                                ),
                            }}
                        />
                    </div>
                    <div className="w-full">
                        <TextField
                            label="Alias"
                            onChange={setTempAlias}
                            value={tempAlias}
                            maxLength={100}
                            decoration={{
                                endDecoration: (
                                    <InputDecoration>
                                        <Tooltip
                                            message={`(Optional) A short alias to use when selecting or displaying this connection.`}
                                            icon={<i className="fa-sharp fa-regular fa-circle-question" />}
                                        >
                                            <i className="fa-sharp fa-regular fa-circle-question" />
                                        </Tooltip>
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
                            onChange={setTempPort}
                            isNumber={true}
                            decoration={{
                                endDecoration: (
                                    <InputDecoration>
                                        <Tooltip
                                            message={`(Optional) Defaults to 22. Set if the server you are connecting to listens to a non-standard
													SSH port.`}
                                            icon={<i className="fa-sharp fa-regular fa-circle-question" />}
                                        >
                                            <i className="fa-sharp fa-regular fa-circle-question" />
                                        </Tooltip>
                                    </InputDecoration>
                                ),
                            }}
                        />
                    </div>
                    <div className="w-full">
                        <Dropdown
                            label="Auth Mode"
                            options={[
                                { value: "none", label: "none" },
                                { value: "key", label: "key" },
                                { value: "password", label: "password" },
                                { value: "key+password", label: "key+passphrase" },
                            ]}
                            value={tempAuthMode}
                            onChange={setTempAuthMode}
                            decoration={{
                                endDecoration: (
                                    <InputDecoration>
                                        <Tooltip
                                            message={
                                                <ul>
                                                    <li>
                                                        <b>none</b> - no authentication details are stored.
                                                    </li>
                                                    <li>
                                                        <b>key</b> - provide a custom private key for authentication.
                                                    </li>
                                                    <li>
                                                        <b>password</b> - provide a password (to save) for
                                                        authentication.
                                                    </li>
                                                    <li>
                                                        <b>key+passphrase</b> - provide a custom private key with a
                                                        passphrase (to save) for authentication.
                                                    </li>
                                                </ul>
                                            }
                                            icon={<i className="fa-sharp fa-regular fa-circle-question" />}
                                        >
                                            <i className="fa-sharp fa-regular fa-circle-question" />
                                        </Tooltip>
                                    </InputDecoration>
                                ),
                            }}
                        />
                    </div>
                    {(tempAuthMode === "key" || tempAuthMode === "key+password") && (
                        <TextField
                            label="SSH Keyfile"
                            placeholder="keyfile path"
                            onChange={setTempKeyFile}
                            value={tempKeyFile}
                            maxLength={400}
                            required={true}
                            decoration={{
                                endDecoration: (
                                    <InputDecoration>
                                        <Tooltip
                                            message={`(Required) The path to your ssh private key file.`}
                                            icon={<i className="fa-sharp fa-regular fa-circle-question" />}
                                        >
                                            <i className="fa-sharp fa-regular fa-circle-question" />
                                        </Tooltip>
                                    </InputDecoration>
                                ),
                            }}
                        />
                    )}
                    {(tempAuthMode === "password" || tempAuthMode === "key+password") && (
                        <PasswordField
                            label={tempAuthMode === "password" ? "SSH Password" : "Key Passphrase"}
                            placeholder="password"
                            onChange={setTempPassword}
                            value={tempPassword}
                            maxLength={400}
                        />
                    )}
                    <div className="w-full">
                        <Dropdown
                            label="Connect Mode"
                            options={[
                                { value: "startup", label: "startup" },
                                { value: "auto", label: "auto" },
                                { value: "manual", label: "manual" },
                            ]}
                            value={tempConnectMode}
                            onChange={setTempConnectMode}
                        />
                    </div>
                    <div className="w-full">
                        <Dropdown
                            label="Shell Preference"
                            options={[
                                { value: "detect", label: "detect" },
                                { value: "bash", label: "bash" },
                                { value: "zsh", label: "zsh" },
                            ]}
                            value={tempShellPref}
                            onChange={setTempShellPref}
                        />
                    </div>
                    {!util.isBlank(getErrorStr() as string) && (
                        <div className="settings-field settings-error">Error: {getErrorStr()}</div>
                    )}
                </div>
            </div>
            <Modal.Footer
                onCancel={model.closeModal}
                onOk={handleSubmitRemote}
                okLabel="Connect"
                keybindings={true}
            />
        </Modal>
    );
});

export { CreateRemoteConnModal };