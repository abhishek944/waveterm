// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useRef, useState, useEffect } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel } from "@/models";
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const NumOfLines = 50;

const DisconnectedModal: React.FC = observer(() => {
    const logRef = useRef<HTMLDivElement>(null);
    const [logs, setLogs] = useState("");
    const [logInterval, setLogInterval] = useState<NodeJS.Timeout | null>(null);

    const restartServer = () => {
        GlobalModel.restartWaveSrv();
    };

    const tryReconnect = () => {
        GlobalModel.ws.connectNow("manual");
    };

    const fetchLogs = () => {
        GlobalModel.getLastLogs(
            NumOfLines,
            action((fetchedLogs: string) => {
                setLogs(fetchedLogs);
                if (logRef.current != null) {
                    logRef.current.scrollTop = logRef.current.scrollHeight;
                }
            })
        );
    };

    useEffect(() => {
        fetchLogs();

        const interval = setInterval(() => {
            fetchLogs();
        }, 5000);
        setLogInterval(interval);

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, []);

    useEffect(() => {
        if (logRef.current != null) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <Dialog open={true}>
            <DialogContent className="disconnected-modal">
                <DialogHeader>
                    <DialogTitle>Wave Client Disconnected</DialogTitle>
                </DialogHeader>
                <div className="p-0">
                    <div className="modal-content">
                        <div className="inner-content">
                            <div
                                ref={logRef}
                                className="h-[335px] mb-5 overflow-auto scrollbar-hide hover:scrollbar-default"
                            >
                                <pre className="text-[var(--app-text-color)] bg-[var(--pre-bg-color)]">{logs}</pre>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="secondary" onClick={tryReconnect}>
                        <i className="fa-sharp fa-solid fa-rotate mr-2" />
                        Try Reconnect
                    </Button>
                    <Button variant="secondary" onClick={restartServer}>
                        <i className="fa-sharp fa-solid fa-triangle-exclamation mr-2" />
                        Restart Wave Backend
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

export { DisconnectedModal };