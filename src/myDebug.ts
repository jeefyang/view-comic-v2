import PageSpy from '@huolala-tech/page-spy-browser';
import DataHarborPlugin from '@huolala-tech/page-spy-plugin-data-harbor';
import RRWebPlugin from '@huolala-tech/page-spy-plugin-rrweb';
import VConsole from "vconsole";

export function initDebug() {
    const ip = location.hostname;
    const ipList = ip.split('.');
    // 判断是否是内网ip,如果不是就不启动debug
    for (let i = 0; i < ipList.length; i++) {
        const a = parseInt(ipList[i]);
        if (Number.isNaN(a)) {
            return;
        }
    }
    console.warn('debug启动了');
    new VConsole({ theme: 'dark' });

    window['$harbor'] = new DataHarborPlugin();
    window['$rrweb'] = new RRWebPlugin();

    [window['$harbor'], window['$rrweb']].forEach(p => {
        PageSpy.registerPlugin(p);
    });

    const spy = new PageSpy({
        api: `${ip}:6752`,
        clientOrigin: `http://${ip}:6752`,
        enableSSL: false,
        autoRender: false,
    });
    window['$pageSpy']=spy;
    console.log('spy', spy.address);
}