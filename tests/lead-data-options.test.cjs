const test = require('node:test');
const assert = require('node:assert/strict');
const {readOptions,readLeadContacts,SOURCES} = require('../lead-data-options.cjs');
test('options use exact worksheet columns, exclude blanks and trim duplicates', async () => {
    const queries = [];
    const result = await readOptions(async value => {
        const url = new URL(value);
        queries.push([url.searchParams.get('sheet'),url.searchParams.get('tq')]);
        return {ok:true,text:async () => url.searchParams.get('tq') === 'select A' ? '"รายการ"\n" AION "\n"AION"\n""\n"รุ่น, พิเศษ"' : '"ID","รายการ"\n"1"," AION "\n"2","AION"\n"3",""\n"4","รุ่น, พิเศษ"'};
    });
    assert.deepEqual(queries,SOURCES.map(([sheet,col]) => [sheet,col === 'A' ? 'select A' : 'select A,'+col]));
    for (const values of Object.values(result)) assert.deepEqual(values,['AION','รุ่น, พิเศษ']);
});
test('missing access or empty source fails instead of returning empty dropdowns', async () => {
    await assert.rejects(readOptions(async () => ({ok:false})),/อ่านรายการ/);
    await assert.rejects(readOptions(async () => ({ok:true,text:async () => '<html>Sign in</html>'})),/ไม่ได้ส่งข้อมูลตาราง/);
    await assert.rejects(readOptions(async () => ({ok:true,text:async () => '"ID","รายการ"\n"1",""'})),/ไม่พบตัวเลือก/);
});
test('lead status reads the sheet again and reflects deleted rows without local saved flags', async () => {
    let deleted = false;
    const fetcher = async (url,options) => {
        assert.equal(new URL(url).searchParams.get('sheet'),'lead');
        assert.equal(options.cache,'no-store');
        return {ok:true,text:async () => '"ช่องทางติดต่อ","ชื่อช่องทางติดต่อ","ชื่อลูกค้า","เบอร์โทร"' + (deleted ? '' : '\n"Line","Weerachon","Weerachon","0991234567"')};
    };
    assert.deepEqual(await readLeadContacts(fetcher),[{channel:'Line',contact:'Weerachon',phone:'0991234567'}]);
    deleted = true;
    assert.deepEqual(await readLeadContacts(fetcher),[]);
    await assert.rejects(readLeadContacts(async () => ({ok:false})),/ไม่สำเร็จ/);
});
