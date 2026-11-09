from apps.contests.exporters.utils import render_open_answer_document


def test_preserves_literal_text_paragraphs_and_math_source():
    document={'version':1,'nodes':[{'type':'paragraph','children':[{'type':'text','text':'*ptr* vector<int>'}]},{'type':'paragraph','children':[{'type':'text','text':'第二段 '},{'type':'math','latex':r'\frac{a}{b}'}]}]}
    html=render_open_answer_document(document)
    assert '<p>*ptr* vector&lt;int&gt;</p>' in html
    assert html.count('<p>') == 2
    assert r'\frac{a}{b}' in html
    assert '<em>' not in html
