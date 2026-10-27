'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const files=['Code.gs','LeadSheet.gs','CarContactHistory.gs','CarBookingStatusSync.gs','CarCrmAuth.gs','CarLeadService.gs','appsscript.json'];
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function auditBaseline(candidate,comparison){
  return files.map(file=>{
    const read=base=>{try{return fs.readFileSync(path.join(base,file),'utf8').replace(/\r\n/g,'\n');}catch(error){if(error.code==='ENOENT')return null;throw error;}};
    const a=read(candidate),b=read(comparison);
    return {file,candidatePresent:a!==null,comparisonPresent:b!==null,same:a!==null&&b!==null&&a===b,candidateSha256:a===null?null:digest(a),comparisonSha256:b===null?null:digest(b)};
  });
}
if(require.main===module){
  const comparison=process.argv[2];if(!comparison)throw Error('Pass the verified local comparison directory; no live source is fetched.');
  const rows=auditBaseline(path.resolve(__dirname,'../..'),path.resolve(comparison));
  console.log(JSON.stringify({mode:'LOCAL_SOURCE_COMPARISON',liveSourceVerified:false,rows},null,2));
}
module.exports={auditBaseline};
