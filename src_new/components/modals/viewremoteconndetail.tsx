// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useRef, useEffect } from "react";
import { observer } from "mobx-react";
import { clsx } from "clsx";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import * as util from "@/utils/util";
import * as textmeasure from "@/utils/textmeasure";
import * as appconst from "@/appconst";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogHeader,
    DialogTitle,
    DialogContent,
    DialogFooter,
} from "@/components/ui/modal";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Status } from "@/components/ui/status";

const ViewRemoteConnDetailModal: React.FC = observer(() => {
    const termRef = useRef<HTMLDivElement>(null);
    const model = GlobalModel.remotesModel;

    const getSelectedRemote = (): RemoteType => {
        const selectedRemoteId = model.selectedRemoteId.get();
        return GlobalModel.getRemote(selectedRemoteId);
    };

    const selectedRemote = getSelectedRemote();

    useEffect(() => {
        const elem = termRef.current;
        if (elem == null) {
            console.log("ERROR null term-remote element");
            return;
        }
        model.createTermWrap(elem);

        return () => {
            model.disposeTerm();
        };
    }, []);

    useEffect(() => {
        if (selectedRemote == null || selectedRemote.archived) {
            model.deSelectRemote();
        }
    }, [selectedRemote]);

    const clickTermBlock = (): void => {
        if (model.remoteTermWrap != null) {
            model.remoteTermWrap.giveFocus();
        }
    };

    const getRemoteTypeStr = (remote: RemoteType): string => {
        if (!util.isBlank(remote.uname)) {
            let unameStr = remote.uname;
            unameStr = unameStr.replace("|", ", ");
            return remote.remotetype + " (" + unameStr + ")";
        }
        return remote.remotetype;
    };

    const connectRemote = (remoteId: string) => {
        GlobalCommandRunner.connectRemote(remoteId);
    };

    const disconnectRemote = (remoteId: string) => {
        GlobalCommandRunner.disconnectRemote(remoteId);
    };

    const installRemote = (remoteId: string) => {
        GlobalCommandRunner.installRemote(remoteId);
    };

    const cancelInstall = (remoteId: string) => {
        GlobalCommandRunner.installCancelRemote(remoteId);
    };

    const openEditModal = (): void => {
        GlobalModel.remotesModel.startEditAuth();
    };

    const getStatus = (status: string) => {
        switch (status) {
            case "connected":
                return "green";
            case "disconnected":
                return "gray";
            default:
                return "red";
        }
    };

    const clickArchive = async (): Promise<void> => {
        if (selectedRemote && selectedRemote.status === "connected") {
            GlobalModel.showAlert({ message: "Cannot delete when connected.  Disconnect and try again." });
            return;
        }
        const confirm = await GlobalModel.showAlert({
            message: "Are you sure you want to delete this connection?",
            confirm: true,
        });
        if (!confirm) {
            return;
        }
        if (selectedRemote) {
            GlobalCommandRunner.archiveRemote(selectedRemote.remoteid);
        }
        GlobalModel.modalsModel.popModal();
    };

    const clickReinstall = (): void => {
        GlobalCommandRunner.installRemote(selectedRemote.remoteid);
    };

    const handleClose = (): void => {
        model.closeModal();
        model.setRecentConnAdded(false);
    };

    const renderInstallStatus = (remote: RemoteType): React.ReactNode => {
        let statusStr: string = null;
        if (remote.installstatus === "disconnected") {
            if (remote.needswaveshellupgrade) {
                statusStr = "waveshell " + remote.waveshellversion + " - needs upgrade";
            } else if (util.isBlank(remote.waveshellversion)) {
                statusStr = "waveshell unknown";
            } else {
                statusStr = "waveshell " + remote.waveshellversion + " - current";
            }
        } else {
            statusStr = remote.installstatus;
        }
        if (statusStr == null) {
            return null;
        }
        return (
            <div key="install-status" className="flex flex-row items-center">
                <div className="font-bold w-48 flex flex-row items-center">Install Status</div>
                <div className="flex flex-row items-center text-[var(--app-text-color)]">{statusStr}</div>
            </div>
        );
    };

    const renderHeaderBtns = (remote: RemoteType): React.ReactNode => {
        const buttons: React.ReactNode[] = [];
        const disconnectButton = (
            <Button className="secondary" onClick={() => disconnectRemote(remote.remoteid)}>
                Disconnect Now
            </Button>
        );
        const connectButton = (
            <Button className="secondary" onClick={() => connectRemote(remote.remoteid)}>
                Connect Now
            </Button>
        );
        const tryReconnectButton = (
            <Button className="secondary" onClick={() => connectRemote(remote.remoteid)}>
                Try Reconnect
            </Button>
        );
        const updateAuthButton = (
            <Button className="secondary" onClick={() => openEditModal()}>
                Edit
            </Button>
        );
        const cancelInstallButton = (
            <Button className="secondary" onClick={() => cancelInstall(remote.remoteid)}>
                Cancel Install
            </Button>
        );
        let installNowButton = (
            <Button className="secondary" onClick={() => installRemote(remote.remoteid)}>
                Install Now
            </Button>
        );
        let archiveButton = (
            <Button className="secondary danger" onClick={() => clickArchive()}>
                Delete
            </Button>
        );
        const reinstallButton = (
            <Button className="secondary" onClick={clickReinstall}>
                Reinstall
            </Button>
        );
        
        if (remote.local) {
            installNowButton = <></>;
            // cancelInstallButton = <></>;
        }
        
        if (remote.sshconfigsrc === "sshconfig-import") {
            archiveButton = (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button className="secondary danger" onClick={() => clickArchive()}>
                                Delete
                                <i className="fa-sharp fa-regular fa-fw fa-triangle-exclamation" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <span>
                                Connections imported from an ssh config file can be deleted, but will come back upon
                                importing again. They will stay removed if you follow{" "}
                                <a href="https://legacydocs.waveterm.dev/features/sshconfig-imports">this procedure</a>.
                            </span>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        }
        
        if (remote.status === "connected" || remote.status === "connecting") {
            buttons.push(disconnectButton);
        } else if (remote.status === "disconnected") {
            buttons.push(connectButton);
        } else if (remote.status === "error") {
            if (remote.needswaveshellupgrade) {
                if (remote.installstatus === "connecting") {
                    buttons.push(cancelInstallButton);
                } else {
                    buttons.push(installNowButton);
                }
            } else {
                buttons.push(tryReconnectButton);
            }
        }
        
        buttons.push(reinstallButton);
        buttons.push(updateAuthButton);
        buttons.push(archiveButton);

        return (
            <>
                {buttons.map((button, i) => (
                    <div key={i}>{button}</div>
                ))}
            </>
        );
    };

    const getMessage = (remote: RemoteType): string => {
        let message = "";
        if (remote.status === "connected") {
            message = "Connected and ready to run commands.";
        } else if (remote.status === "connecting") {
            message = remote.waitingforpassword ? "Connecting, waiting for user-input..." : "Connecting...";
            if (remote.countdownactive) {
                const connectTimeout = remote.connecttimeout ?? 0;
                message = message + " (" + connectTimeout + "s)";
            }
        } else if (remote.status === "disconnected") {
            message = "Disconnected";
        } else if (remote.status === "error") {
            if (remote.noinitpk) {
                message = "Error, could not connect.";
            } else if (remote.needswaveshellupgrade) {
                if (remote.installstatus === "connecting") {
                    message = "Installing...";
                } else {
                    message = "Error, needs install.";
                }
            } else {
                message = "Error";
            }
        }
        return message;
    };

    if (selectedRemote == null) {
        return null;
    }

    const isTermFocused = model.remoteTermWrapFocus.get();
    const termFontSize = GlobalModel.getTermFontSize();
    const termWidth = textmeasure.termWidthFromCols(appconst.RemotePtyCols, termFontSize);
    const remoteAliasText = util.isBlank(selectedRemote.remotealias) ? "(none)" : selectedRemote.remotealias;
    const selectedRemoteStatus = selectedRemote.status;

    return (
        <Dialog open={true} onOpenChange={() => handleClose()}>
            <DialogContent className="w-auto max-w-[80vw] max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle>Connection</DialogTitle>
                </DialogHeader>
                <OverlayScrollbarsComponent
                    className="flex flex-col p-5 items-start w-full h-full overflow-y-auto"
                options={{ scrollbars: { autoHide: "leave" } }}
                defer={true}
            >
                <div className="flex flex-col items-start gap-3">
                    <div className="flex flex-row">
                        <div className="text-[var(--app-text-primary-color)] text-[15px] font-medium leading-5">
                            {util.getRemoteName(selectedRemote)}&nbsp;
                            <GetImportTooltip remote={selectedRemote} />
                        </div>
                    </div>
                    <div className="flex justify-end items-start">
                        <div className="flex items-center gap-2">{renderHeaderBtns(selectedRemote)}</div>
                    </div>
                </div>
                <div className="w-full pt-4">
                    <div className="flex flex-row items-center">
                        <div className="font-bold w-48 flex flex-row items-center">Conn Id</div>
                        <div className="flex flex-row items-center text-[var(--app-text-color)]">
                            {selectedRemote.remoteid}
                        </div>
                    </div>
                    <div className="flex flex-row items-center">
                        <div className="font-bold w-48 flex flex-row items-center">Type</div>
                        <div className="flex flex-row items-center text-[var(--app-text-color)]">
                            {getRemoteTypeStr(selectedRemote)}
                        </div>
                    </div>
                    <div className="flex flex-row items-center">
                        <div className="font-bold w-48 flex flex-row items-center">Canonical Name</div>
                        <div className="flex flex-row items-center text-[var(--app-text-color)]">
                            {selectedRemote.remotecanonicalname}
                            {!util.isBlank(selectedRemote.remotevars.port) && selectedRemote.remotevars.port !== "22" && (
                                <span className="ml-[5px]">(port {selectedRemote.remotevars.port})</span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-row items-center min-h-[24px]">
                        <div className="font-bold w-48 flex flex-row items-center">Alias</div>
                        <div className="flex flex-row items-center text-[var(--app-text-color)]">{remoteAliasText}</div>
                    </div>
                    <div className="flex flex-row items-center">
                        <div className="font-bold w-48 flex flex-row items-center">Auth Type</div>
                        <div className="flex flex-row items-center text-[var(--app-text-color)]">
                            {!selectedRemote.local ? selectedRemote.authtype : "local"}
                        </div>
                    </div>
                    <div className="flex flex-row items-center">
                        <div className="font-bold w-48 flex flex-row items-center">Connect Mode</div>
                        <div className="flex flex-row items-center text-[var(--app-text-color)]">
                            {selectedRemote.connectmode}
                        </div>
                    </div>
                    <div className="flex flex-row items-center">
                        <div className="font-bold w-48 flex flex-row items-center">Shell Pref</div>
                        <div className="flex flex-row items-center text-[var(--app-text-color)]">
                            {selectedRemote.shellpref}
                        </div>
                    </div>
                    {renderInstallStatus(selectedRemote)}
                    <div className="flex-1 min-h-[20px]" />
                    <div className="flex h-[30px] px-2 py-[3px] items-center gap-2 self-stretch rounded-md bg-white/[0.08]">
                        <Status status={getStatus(selectedRemote.status)} text={getMessage(selectedRemote)} />
                    </div>
                    <div
                        className={clsx(
                            "mt-[5px] overflow-x-auto overflow-y-hidden border border-[var(--app-border-color)] rounded-md px-2.5 py-1.5 relative",
                            { "focus": isTermFocused },
                            selectedRemote != null ? "status-" + selectedRemote.status : null
                        )}
                    >
                        {!isTermFocused && (
                            <div 
                                className="absolute inset-0 z-10 cursor-pointer" 
                                onClick={clickTermBlock}
                            />
                        )}
                        {model.showNoInputMsg.get() && (
                            <div className="absolute top-2 left-2 text-sm text-gray-400 z-20">
                                input is only allowed while status is 'connecting'
                            </div>
                        )}
                        <div
                            ref={termRef}
                            className="terminal-connectelem"
                            data-remoteid={selectedRemote.remoteid}
                            style={{
                                height: textmeasure.termHeightFromRows(
                                    appconst.RemotePtyRows,
                                    termFontSize,
                                    appconst.RemotePtyTotalRows
                                ),
                                width: termWidth,
                            }}
                        />
                    </div>
                </div>
                </OverlayScrollbarsComponent>
            </DialogContent>
        </Dialog>
    );
});

const GetImportTooltip: React.FC<{ remote: RemoteType }> = ({ remote }) => {
    if (remote.sshconfigsrc === "sshconfig-import") {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <i className="fa-sharp fa-solid fa-file-import" />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>This remote was imported from an SSH config file.</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }
    return null;
};

export { ViewRemoteConnDetailModal };