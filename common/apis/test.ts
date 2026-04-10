import { apiUrlsTrans } from "./tools/apiUrlsTrans";
import { TransExpressRouter } from "./tools/transExpressRouter";


 const TestApiUrl = apiUrlsTrans("test/", {
    testPost: { method: "POST", from: {} as { text: string; }, to: {} as { testData: string; } },
    testGet: { method: "POST", from: {} as { text: string; }, to: {} as { testData: string; } },
    testFrom: { method: "POST", from: {} as { text: string; } },
    testTo: { method: "POST", to: {} as { data: string; } }
});

//@ts-expect-error
const testRouter=new TransExpressRouter(TestApiUrl,undefined)


testRouter.setRouter('testPost',async (from)=>{
    
    return {data:{testData:"123"}}
})
