const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync(__dirname+'/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const sha='a'.repeat(40), html='<!doctype html><html><body>✓ <script>class RepositorySnapshot {}</script></body></html>';
async function run(responses){
 const calls=[],nodes=new Map(),output={};
 const element=()=>({style:{},children:[],textContent:'',replaceChildren(){this.children=[]},appendChild(child){this.children.push(child)}});
 const document={cookie:'',getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)},createElement:element,open(){},write(value){output.html=value},close(){}};
 const context={document,window:{},location:{reload(){}},localStorage:{getItem(){return JSON.stringify({tok:'fixture-only',repo:'owner/repo'})},setItem(){},removeItem(){}},AbortSignal,TextDecoder,Uint8Array,atob,fetch:async(url,options)=>{calls.push({url,options});const r=responses.shift();if(r instanceof Error)throw r;return {ok:r.status===undefined||r.status<400,status:r.status||200,json:async()=>r.json,text:async()=>r.text}}};
 vm.runInNewContext(script,context);
 for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
 return {calls,nodes,output};
}
test('loader pins the app to a validated revision and decodes Unicode',async()=>{
 const r=await run([{json:{sha}},{json:{content:Buffer.from(html).toString('base64')}}]);
 assert.equal(r.output.html,html);assert.equal(r.calls[1].url,'https://api.github.com/repos/owner/repo/contents/app/index.html?ref='+sha);
});
test('large app fallback stays on the authenticated GitHub endpoint and revision',async()=>{
 const r=await run([{json:{sha}},{json:{download_url:'https://untrusted.test/file'}},{text:html}]);
 assert.equal(r.output.html,html);assert.equal(r.calls[2].url,r.calls[1].url);assert.equal(r.calls[2].options.headers.Accept,'application/vnd.github.raw+json');
});
test('failed app download renders a text error and retry controls',async()=>{
 const r=await run([{json:{sha}},{json:{}},{status:503,text:'<img src=x onerror=alert(1)>'}]);
 assert.equal(r.output.html,undefined);const children=r.nodes.get('msg').children;
 assert.match(children[0].textContent,/503/);assert.equal(children[1].textContent,'Retry loading');assert.equal(children[2].textContent,'Reconnect');
});
test('invalid revision is rejected before reading app contents',async()=>{
 const r=await run([{json:{sha:'main'}}]);assert.equal(r.calls.length,1);assert.equal(r.output.html,undefined);assert.match(r.nodes.get('msg').children[0].textContent,/Invalid app revision/);
});
