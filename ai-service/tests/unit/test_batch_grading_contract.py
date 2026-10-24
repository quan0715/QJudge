import csv
import io
import json
from copy import deepcopy

import pytest

from application.batch_grading_contract import digest, parse_batch_units, validate_unit


def fixture():
    context = {
        'rubric_version': 'v1', 'teacher_note': '',
        'questions': [
            {'question_id': 'a', 'group_id': 'g', 'question_type': 'short_answer', 'max_score': 3,
             'prompt': 'Keep reading. No math. Stop if x<=0.', 'explanation': 'Partial credit'},
            {'question_id': 'b', 'group_id': 'g', 'question_type': 'short_answer', 'max_score': 5,
             'prompt': 'Keep reading. No math. Check prime.', 'explanation': 'Partial credit'},
        ],
        'students': [{'student_id':'s1','answers':[
            {'question_id':'a','exam_answer_id':'a1','writable':True},
            {'question_id':'b','exam_answer_id':'b1','writable':True},
        ]}],
    }
    rubric = {'version':'v1', 'criteria':[], 'shared_requirements':[
        {'source_quote':'Keep reading.', 'criterion_id':'loop'},
        {'source_quote':'No math.', 'criterion_id':'manual'},
    ]}
    for cid,qid,pts,quote in [('loop','a',1,'Keep reading.'),('stop','a',2,'Stop if x<=0.'),('manual','b',1,'No math.'),('prime','b',4,'Check prime.')]:
        rubric['criteria'].append({'id':cid,'question_id':qid,'points':pts,'description':cid,
            'source_question_id':qid,'source_field':'prompt','source_quote':quote,'partial_credit':'per requirement'})
    text = json.dumps(context)
    manifest = {'question_ids':['a','b'],'context_sha256':digest(text),'rubric_version':'v1'}
    def csv_for(aid,score,earned):
        buf=io.StringIO();w=csv.writer(buf);w.writerow(['exam_answer_id','score','reason','rubric_version','criterion_scores'])
        w.writerow([aid,score,'Missing loop / uses sqrt','v1',json.dumps(earned)]);return buf.getvalue()
    files = {'a':csv_for('a1',2,{'loop':0,'stop':2}),'b':csv_for('b1',4,{'manual':0,'prime':4})}
    return manifest,context,rubric,files


def validate(m,c,r,files):
    return validate_unit(m,json.dumps(c),json.dumps(r),files)


def test_whole_group_keeps_child_scores_and_single_ownership():
    m,c,r,f=fixture();plans=validate(m,c,r,f)
    assert plans['a'].rows[0].score == 2
    assert plans['b'].rows[0].score == 4


@pytest.mark.parametrize('change', ['missing_child','wrong_total','wrong_version','missing_criterion','extra_answer','duplicate_answer','nan','reference_only','extra_output','duplicate_shared','unowned_shared','changed_context','changed_rubric'])
def test_invalid_unit_is_rejected_before_any_writes(change):
    m,c,r,f=fixture()
    if change=='missing_child':f['b']=f['b'].splitlines()[0]+'\n'
    elif change=='wrong_total':f['a']=f['a'].replace('a1,2,','a1,3,')
    elif change=='wrong_version':f['b']=f['b'].replace(',v1,',',old,')
    elif change=='missing_criterion':f['b']=f['b'].replace('""manual"": 0, ','')
    elif change=='extra_answer':f['a']=f['a'].replace('a1,','other-student,')
    elif change=='duplicate_answer':f['a']+=f['a'].splitlines()[1]+'\n'
    elif change=='nan':f['a']=f['a'].replace('a1,2,','a1,NaN,')
    elif change=='reference_only':r['criteria'][0]['source_field']='reference_answer'
    elif change=='extra_output':r['criteria'][0]['source_quote']='print personal cup count'
    elif change=='duplicate_shared':r['shared_requirements'].append(deepcopy(r['shared_requirements'][0]))
    elif change=='unowned_shared':r['shared_requirements'][0]['criterion_id']='somebody_else'
    elif change=='changed_context':c['questions'][0]['prompt']='changed'
    elif change=='changed_rubric':m['rubric_sha256']=digest('previous rubric')
    with pytest.raises(ValueError):validate(m,c,r,f)


def test_readonly_sibling_stays_in_context_but_cannot_receive_score():
    m,c,r,f=fixture();m['question_ids']=['a'];c['students'][0]['answers'][1]['writable']=False
    m['context_sha256']=digest(json.dumps(c))
    assert set(validate(m,c,r,f))=={'a'}


def test_empty_and_malformed_manifest_do_not_downgrade_to_legacy():
    assert parse_batch_units('batch_question_id: a\nold run') is None
    for message in ['batch_units: []','batch_units: broken']:
        with pytest.raises(ValueError):parse_batch_units(message)


def test_background_only_group_requires_explicit_explanation():
    m,c,r,f=fixture();r['shared_requirements']=[]
    with pytest.raises(ValueError):validate(m,c,r,f)
    r['shared_requirements_note']='This fixture models shared data only; no behavioral requirements.'
    assert len(validate(m,c,r,f))==2


def test_one_criterion_can_own_several_verifiable_shared_requirements():
    m,c,r,f=fixture()
    # A combined criterion can quote one source sentence while the ownership
    # inventory independently quotes another shared sentence in the same prompt.
    r['shared_requirements'][1]['criterion_id']='loop'
    assert len(validate(m,c,r,f))==2


@pytest.mark.parametrize("change", ["missing_id", "missing_question_id", "missing_points", "null_criterion", "list_question_id", "null_rubric", "bad_shared"])
def test_malformed_rubric_is_a_validation_error(change):
    m, c, r, files = fixture()
    if change.startswith("missing_"):
        del r["criteria"][0][change.removeprefix("missing_")]
    elif change == "null_criterion": r["criteria"][0] = None
    elif change == "list_question_id": r["criteria"][0]["question_id"] = []
    elif change == "null_rubric": r = None
    elif change == "bad_shared": r["shared_requirements"][0] = {}
    with pytest.raises(ValueError):
        validate(m, c, r, files)
