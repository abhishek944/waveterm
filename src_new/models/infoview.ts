import {
    action,
    makeObservable
} from "mobx";
import { Model } from "./model";

class InfoViewModel {
    globalModel: Model;

    constructor(globalModel: Model) {
        this.globalModel = globalModel;
        makeObservable(this);
    }

    @action
    showInfoView(): void {
        this.globalModel.activeMainView.set("info");
    }
}

export { InfoViewModel };