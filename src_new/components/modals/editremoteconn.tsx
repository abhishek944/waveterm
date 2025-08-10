// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel, GlobalCommandRunner, RemotesModel } from "@/models";
import { Modal, TextField, InputDecoration, Dropdown, PasswordField, Tooltip } from "@/elements";
import * as util from "@/util/util";

const PasswordUnchangedSentinel = "--unchanged--";

const EditRemoteConnModal: React.FC = observer(() => {
    const model = GlobalModel.remotesModel;
    const selectedRemoteId = model.selectedRemoteId.get();
    const selectedRemote = GlobalModel.getRemote(selectedRemoteId);
    const remoteEdit = model.remoteEdit.get();
    const isAuthEditMode = model.isAuthEditMode();
    
    const [tempAlias, setTempAlias] = useState<string>(null);
    const [tempKeyFile, setTempKeyFile] = useState<string>(null);
    const [tempPassword, setTempPassword] = useState<string>(null);
    const [tempConnectMode, setTempConnectMode] = useState<string>(null);
    const [tempAuthMode, setTempAuthMode] = useState<string>(null);
    const [tempShellPref, setTempShellPref] = useState<string>(null);

    const isLocalRemote = (): boolean => {
        return selectedRemote?.local;
    };

    const isImportedRemote = (): boolean => {
        return selectedRemote?.sshconfigsrc === "sshconfig-import";
    };

    useEffect(() => {
        action(() => {
            setTempAlias(selectedRemote?.remotealias);
            setTempKeyFile(remoteEdit?.keystr);
            setTempPassword(remoteEdit?.haspassword ? PasswordUnchangedSentinel : "");
            setTempConnectMode(selectedRemote?.connectmode);
            setTempAuthMode(selectedRemote?.authtype);
            setTempShellPref(selectedRemote?.shellpref);
        })();
    }, [selectedRemote, remoteEdit]);

    useEffect(() => {
        if (selectedRemote == null || selectedRemote.archived) {
            model.deSelectRemote();
        }
    }, [selectedRemote]);

    const canResetPw = (): boolean => {
        if (remoteEdit == null) {
            return false;
        }
        return Boolean(remoteEdit.haspassword) && tempPassword !== PasswordUnchangedSentinel;
    };

    const resetPw = (): void => {
        action(() => {
            setTempPassword(PasswordUnchangedSentinel);
        })();
    };

    const onFocusPassword = (e: any) => {
        if (tempPassword === PasswordUnchangedSentinel) {
            e.target.select();
        }
    };

    const submitRemote = (): void => {
        const authMode = tempAuthMode;
        const kwargs: Record<string, string> = {};
        
        if (authMode === "key" || authMode === "key+password") {
            const keyStrEq = util.isStrEq(tempKeyFile, remoteEdit?.keystr);
            if (!keyStrEq) {
                kwargs["key"] = tempKeyFile;
            }
        } else {
            if (!util.isBlank(tempKeyFile)) {
                kwargs["key"] = "";
            }
        }
        
        if (authMode === "password" || authMode === "key+password") {
            if (tempPassword !== PasswordUnchangedSentinel) {
                kwargs["password"] = tempPassword;
            }
        } else {
            if (remoteEdit?.haspassword) {
                kwargs["password"] = "";
            }
        }
        
        if (!util.isStrEq(tempAlias, selectedRemote?.remotealias)) {
            kwargs["alias"] = tempAlias;
        }
        if (!util.isStrEq(tempConnectMode, selectedRemote?.connectmode)) {
            kwargs["connectmode"] = tempConnectMode;
        }
        if (!util.isStrEq(tempShellPref, selectedRemote?.shellpref)) {
            kwargs["shellpref"] = tempShellPref;
        }
        
        kwargs["visual"] = "1";
        kwargs["submit"] = "1";
        GlobalCommandRunner.editRemote(selectedRemote?.remoteid, kwargs);
        model.closeModal();
    };

    const renderAuthModeMessage = (): React.ReactNode => {
        const authMode = tempAuthMode;
        if (authMode === "none") {
            return (
                <span>
                    This connection requires no authentication.
                    <br />
                    Or authentication is already configured in ssh_config.
                </span>
            );
        }
        if (authMode === "key") {
            return <span>Use a public/private keypair.</span>;
        }
        if (authMode === "password") {
            return <span>Use a password.</span>;
        }
        if (authMode === "key+password") {
            return <span>Use a public/private keypair with a passphrase.</span>;
        }
        return null;
    };

    const renderAlias = () => {
        return (
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
        );
    };

    const renderConnectMode = () => {
        return (
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
        );
    };

    const renderShellPref = () => {
        return (
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
        );
    };

    const renderImportedRemoteEditWarning = () => {
        return (
            <div className="flex flex-row items-start">
                <Tooltip
                    message={
                        <span>
                            Most options for connections imported from an ssh config file cannot be edited. For these
                            changes, you must edit the config file and import it again. The shell preference can be
                            edited, but will return to the default if you import again. It will stay changed if you
                            follow{" "}
                            <a href="https://legacydocs.waveterm.dev/features/sshconfig-imports">this procedure</a>.
                        </span>
                    }
                    icon={<i className="fa-sharp fa-regular fa-fw fa-triangle-exclamation" />}
                >
                    <i className="fa-sharp fa-regular fa-fw fa-triangle-exclamation" />
                </Tooltip>
                &nbsp;SSH Config Import Behavior
            </div>
        );
    };

    const renderAuthMode = () => {
        const authMode = tempAuthMode;
        return (
            <>
                <div className="w-full">
                    <Dropdown
                        label="Auth Mode"
                        options={[
                            { value: "none", label: "none" },
                            { value: "key", label: "key" },
                            { value: "password", label: "password" },
                            { value: "key+password", label: "key+password" },
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
                                                    <b>none</b> - no authentication, or authentication is already
                                                    configured in your ssh config.
                                                </li>
                                                <li>
                                                    <b>key</b> - use a private key.
                                                </li>
                                                <li>
                                                    <b>password</b> - use a password.
                                                </li>
                                                <li>
                                                    <b>key+password</b> - use a key with a passphrase.
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
                {(authMode === "key" || authMode === "key+password") && (
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
                {(authMode === "password" || authMode === "key+password") && (
                    <PasswordField
                        label={authMode === "password" ? "SSH Password" : "Key Passphrase"}
                        placeholder="password"
                        onChange={setTempPassword}
                        value={tempPassword}
                        maxLength={400}
                    />
                )}
            </>
        );
    };

    if (remoteEdit === null || !isAuthEditMode) {
        return null;
    }

    const isLocal = isLocalRemote();
    const isImported = isImportedRemote();

    return (
        <Modal className="w-[502px] min-h-[211px]">
            <Modal.Header title="Edit Connection" onClose={model.closeModal} />
            <div className="flex flex-col gap-5">
                <div className="flex flex-col px-5 gap-3 w-full">
                    <div className="flex flex-col items-start gap-3 mb-2.5">
                        <div className="text-[var(--app-text-primary-color)] text-[15px] font-medium leading-5">
                            {util.getRemoteName(selectedRemote)}
                        </div>
                    </div>
                    {!isLocal && !isImported && renderAlias()}
                    {!isLocal && !isImported && renderAuthMode()}
                    {!isLocal && !isImported && renderConnectMode()}
                    {isImported && renderImportedRemoteEditWarning()}
                    {renderShellPref()}
                    {!util.isBlank(remoteEdit?.errorstr) && (
                        <div className="settings-field settings-error">Error: {remoteEdit?.errorstr}</div>
                    )}
                </div>
            </div>
            <Modal.Footer
                onOk={submitRemote}
                onCancel={model.closeModal}
                okLabel="Save"
                keybindings={true}
            />
        </Modal>
    );
});

export { EditRemoteConnModal };