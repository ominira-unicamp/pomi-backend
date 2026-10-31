import { createModule } from "#/Module.js";
import exchangeNoticeSubscription from "./exchange-notice-subscription/ExchangeNoticeSubscription.controller.js";
import exchangeNoticeUnsubscribe from "./exchange-notice-unsubscribe/ExchangeNoticeUnsubscribe.controller.js";

export default createModule({
    controllers: [exchangeNoticeSubscription, exchangeNoticeUnsubscribe]
});
