// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { observer } from "mobx-react";
import { GlobalModel } from "@/models";
import { Dialog, DialogHeader, DialogTitle, DialogContent } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const ClientStopModal: React.FC = observer(() => {
    const refreshClient = () => {
        GlobalModel.refreshClient();
    };

    const cdata = GlobalModel.clientData.get();

    return (
        <Dialog open={true}>
            <DialogContent className="clientstop-modal">
                <DialogHeader>
                    <DialogTitle>Client Not Ready</DialogTitle>
                </DialogHeader>
                <div className="wave-modal-body">
                    <div className="modal-content">
                        <div className="flex flex-col p-[30px] gap-5 items-center">
                            {cdata == null && <div>Cannot get client data.</div>}
                            <div>
                                <Button variant="secondary" onClick={refreshClient}>
                                    <i className="fa-sharp fa-solid fa-rotate mr-2" />
                                    Hard Refresh Client
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
});

export { ClientStopModal };