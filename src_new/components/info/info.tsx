import * as React from "react";
import { observer } from "mobx-react";
import { GlobalModel } from "@/models";
import { MainView } from "../../../src/app/common/elements/mainview";

const InfoViewFC: React.FC = () => {
    const handleClose = () => {
        GlobalModel.showSessionView();
    };

    return (
        <></>
        // <MainView
        //     title="Info"
        //     onClose={handleClose}
        //     scrollable={true}
        // >
        //     <div className="h-full w-full flex items-center justify-center">
        //         <p className="text-2xl text-gray-400">Info View</p>
        //     </div>
        // </MainView>
    );
};

const InfoView = observer(InfoViewFC);

export { InfoView };