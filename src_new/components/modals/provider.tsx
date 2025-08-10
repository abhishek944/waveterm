// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import { GlobalModel } from "@/models";

const ModalsProvider: React.FC = mobxReact.observer(() => {
    const store = GlobalModel.modalsModel.store.slice();

    const rtn: JSX.Element[] = [];
    for (let i = 0; i < store.length; i++) {
        const entry = store[i];
        const Comp = entry.component;
        rtn.push(<Comp key={entry.uniqueKey} {...entry.props} />);
    }
    return <>{rtn}</>;
});

export { ModalsProvider };