import { apiUrlsTrans } from "./apiUrlsTrans";
import { TransExpressRouter } from "./transExpressRouter";
import { TransFetch } from "./transFetch";


const ExampleApiUrl = apiUrlsTrans("test/", {
    testPost: { method: "POST", from: {} as { text: string; }, to: {} as { testData: string; } },
    testGet: { method: "POST", from: {} as { text: string; }, to: {} as { testData: string; } },
    testFrom: { method: "POST", from: {} as { text: string; } },
    testTo: { method: "POST", to: {} as { data: string; } }
});

const exampleRouter = new TransExpressRouter(ExampleApiUrl, undefined);


exampleRouter.setRouter('testPost', async (from) => {

    return { data: { testData: "123" } };
});

const myFetch = new TransFetch(ExampleApiUrl);
myFetch.request("testPost", { text: '123' }).then(res => {
    console.log(res);
});

