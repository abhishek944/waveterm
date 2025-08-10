// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { observer } from "mobx-react";
import { GlobalModel } from "@/models";
import { Modal, Button } from "@/elements";

const ClientStopModal: React.FC = observer(() => {
    const refreshClient = () => {
        GlobalModel.refreshClient();
    };

    const cdata = GlobalModel.clientData.get();

    return (
        <Modal className="clientstop-modal">
            <Modal.Header title="Client Not Ready" />
            <div className="wave-modal-body">
                <div className="modal-content">
                    <div className="flex flex-col p-[30px] gap-5 items-center">
                        {cdata == null && (
                            <div>Cannot get client data.</div>
                        )}
                        <div>
                            <Button
                                className="secondary"
                                onClick={refreshClient}
                                leftIcon={<i className="fa-sharp fa-solid fa-rotate"></i>}
                            >
                                Hard Refresh Client
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
});

export { ClientStopModal };