// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useRef, useState, useEffect } from "react";
import { observer } from "mobx-react";
import { action } from "mobx";
import { GlobalModel } from "@/models";
import { Modal, Button } from "@/elements";

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
        <Modal className="disconnected-modal">
            <Modal.Header title="Wave Client Disconnected" />
            <div className="p-0">
                <div className="modal-content">
                    <div className="inner-content">
                        <div 
                            ref={logRef}
                            className="h-[335px] mb-5 overflow-auto scrollbar-hide hover:scrollbar-default"
                        >
                            <pre className="text-[var(--app-text-color)] bg-[var(--pre-bg-color)]">
                                {logs}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
            <div className="wave-modal-footer">
                <Button
                    className="secondary"
                    onClick={tryReconnect}
                    leftIcon={
                        <span className="icon">
                            <i className="fa-sharp fa-solid fa-rotate" />
                        </span>
                    }
                >
                    Try Reconnect
                </Button>
                <Button
                    className="secondary"
                    onClick={restartServer}
                    leftIcon={<i className="fa-sharp fa-solid fa-triangle-exclamation"></i>}
                >
                    Restart Wave Backend
                </Button>
            </div>
        </Modal>
    );
});

export { DisconnectedModal };