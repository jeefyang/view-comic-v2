import { apiUrlsTrans } from "./apiUrlsTrans.js";
import { TransExpressRouter } from "./transExpressRouter.js";
import { TransFetch } from "./transFetch.js";


const ExampleApiUrl = apiUrlsTrans("test/", {
    testPost: { method: "POST", from: {} as { text: string; }, to: {} as { testData: string; } },
    testGet: { method: "POST", from: {} as { text: string; }, to: {} as { testData: string; } },
    testFrom: { method: "POST", from: {} as { text: string; } },
    testTo: { method: "POST", to: {} as { data: string; } }
});

//@ts-expect-error
const exampleRouter = new TransExpressRouter(ExampleApiUrl, undefined);


exampleRouter.setRouter('testPost', async (from) => {

    return { data: { testData: "123" } };
});

const myFetch = new TransFetch(ExampleApiUrl);
myFetch.request("testPost", { text: '123' }).then(res => {
    console.log(res);
});
