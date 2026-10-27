// Test-only startup seam: suppress native error dialogs, but load the real application code.
const {app,dialog}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
app.getAppPath=()=>root;
dialog.showErrorBox=(title)=>{fs.writeFileSync(path.join(process.env.PES_FOCUS_DATA_DIR,'startup-error.json'),JSON.stringify({title}));};
require(path.join(root,'dist/main/main/main.js'));
