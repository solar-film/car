'use strict';
// Reserved, invented identities only. Each call returns a fresh in-memory snapshot.
function sample() {
  const definitions={
    lead:[['Lead ID','วันที่','เบอร์โทร','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ'],[['L-SYN-1','2026-10-01','','Line','synthetic'],['L-SYN-2','2026-10-27','','FB','synthetic']]],
    Customer:[['CustID','เบอร์โทรศัพท์','ช่องทางติดต่อ','ชื่อช่องทางติดต่อ'],[['C-SYN-1','','Line','synthetic']]],
    Bookings:[['JobID','CustID','Lead ID','วันที่ติดตั้ง','Status'],[['J-SYN-1','C-SYN-1','L-SYN-1','2026-10-01','เสร็จสิ้น'],['J-SYN-2','C-SYN-1','L-SYN-2','2026-11-01','คิวใหม่']]],
    PayIn:[['Pay_ID','JobID'],[['P-SYN-1','J-SYN-1']]]
  };
  const tables=Object.fromEntries(Object.entries(definitions).map(([name,[headers,rows]],i) => [name,{name,gid:i,headers,rows:rows.map(row => Object.fromEntries(headers.map((h,c) => [h,row[c]])))}]));
  return {snapshot:{spreadsheetId:'synthetic-stage-sheet',complete:true,tables},expected:{spreadsheetId:'synthetic-stage-sheet',tables:Object.fromEntries(Object.values(tables).map(t => [t.name,{name:t.name,gid:t.gid}]))}};
}
module.exports={sample};
