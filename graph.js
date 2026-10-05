/* Delegated Graph access. No app secret; MSAL uses authorization code + PKCE. */
class GraphClient {
  constructor(config){this.config=config;this.scopes=config.scopes||['Files.ReadWrite.All'];}
  async init(){
    if(!window.msal)throw Error('Microsoft sign-in library unavailable. Run setup_vendor.py.');
    if(!/^[0-9a-f-]{36}$/i.test(this.config.clientId))throw Error('Enter a valid Microsoft Application (client) ID.');
    const tenant=this.config.tenantId||'organizations';
    if(!/^[A-Za-z0-9.-]+$/.test(tenant))throw Error('Invalid tenant ID.');
    this.auth=new msal.PublicClientApplication({auth:{clientId:this.config.clientId,authority:`https://login.microsoftonline.com/${tenant}`,redirectUri:location.origin+location.pathname},cache:{cacheLocation:'sessionStorage'}});
    await this.auth.initialize();const response=await this.auth.handleRedirectPromise();
    this.account=response?.account||this.auth.getActiveAccount()||this.auth.getAllAccounts()[0];
    if(this.account)this.auth.setActiveAccount(this.account);
    return this.account;
  }
  async login(){await this.auth.loginRedirect({scopes:this.scopes,prompt:'select_account'});}
  async logout(){await this.auth.logoutRedirect({account:this.account,postLogoutRedirectUri:location.origin+location.pathname});}
  async request(path,options={}){
    if(!this.account)throw Error('Sign in with Microsoft first.');
    const url=path.startsWith('https://')?path:'https://graph.microsoft.com/v1.0'+path;
    if(new URL(url).origin!=='https://graph.microsoft.com')throw Error('Refusing to send a token outside Microsoft Graph.');
    let token;
    try{token=await this.auth.acquireTokenSilent({account:this.account,scopes:this.scopes});}
    catch{throw Error('Microsoft sign-in needs renewal or permission consent. Your draft is retained; use Sign in with Microsoft.');}
    const response=await fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${token.accessToken}`},signal:AbortSignal.timeout(45000)});
    if(!response.ok){let message='';try{message=(await response.json()).error?.message||'';}catch{}
      throw Error(`OneDrive ${response.status}: ${message||response.statusText}${response.status===429?' Retry after '+(response.headers.get('Retry-After')||'a few')+' seconds.':''}`);}
    return response;
  }
  base(){if(!this.config.driveId||!this.config.folderId)throw Error('Enter Drive ID and project folder ID, or resolve a shared folder link.');return `/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(this.config.folderId)}`;}
  path(path){const parts=path.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||/[\\:]/.test(p)))throw Error('Use a relative OneDrive path with no empty segments, dots or backslashes.');return parts.map(encodeURIComponent).join('/');}
  async item(path){return(await this.request(`${this.base()}:/${this.path(path)}`)).json();}
  async read(path){return this.readItem(await this.item(path));}
  async readItem(item){
    // Graph /content redirects to a preauthenticated URL. Read metadata first to avoid CORS redirect problems.
    let url=item['@microsoft.graph.downloadUrl'];
    if(!url){item=await(await this.request(`/drives/${encodeURIComponent(this.config.driveId)}/items/${encodeURIComponent(item.id)}`)).json();url=item['@microsoft.graph.downloadUrl'];}
    if(!url||new URL(url).protocol!=='https:')throw Error('OneDrive did not provide a secure file download URL.');
    const r=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`File download failed (${r.status}).`);return r.text();
  }
  async list(path){
    let next=`${this.base()}:/${this.path(path)}:/children?$select=id,name,file,lastModifiedDateTime&$top=200`;const items=[];
    while(next){const page=await(await this.request(next)).json();items.push(...page.value);next=page['@odata.nextLink'];}return items;
  }
  async writeNew(path,text){
    const r=await this.request(`${this.base()}:/${this.path(path)}:/content?@microsoft.graph.conflictBehavior=fail`,{method:'PUT',headers:{'Content-Type':'text/csv; charset=utf-8'},body:text});
    const item=await r.json();if(!item.id)throw Error('Upload response did not confirm a saved file.');return item;
  }
  async resolve(link){
    if(!/^https:\/\//i.test(link))throw Error('Paste the HTTPS sharing link to the project folder.');
    const share='u!'+btoa(String.fromCharCode(...new TextEncoder().encode(link))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const item=await(await this.request(`/shares/${share}/driveItem`)).json();
    const actual=item.remoteItem||item;if(!actual.folder)throw Error('Sharing link must refer to a folder.');
    if(!actual.parentReference?.driveId)throw Error('Unable to resolve drive ID. Enter the IDs directly.');
    return{driveId:actual.parentReference.driveId,folderId:actual.id};
  }
}
window.GraphClient=GraphClient;
