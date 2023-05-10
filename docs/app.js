importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.4/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/panel-0.14.4-py3-none-any.whl', 'pyodide-http==0.1.0', 'holoviews>=1.15.4', 'holoviews>=1.15.4', 'hvplot', 'numpy', 'pandas']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

#!/usr/bin/env python
# coding: utf-8

# ### App!

# In[2]:


import hvplot.pandas
import panel as pn
import pandas as pd
import numpy as np
import holoviews as hv
from holoviews import opts
hvplot.extension('plotly')


# #### Data

# In[56]:


# loading data
df = pd.read_table('5-Org_indicators.tsv')
ins = pd.read_csv('4-Org_master_list_edited.csv')
names = ins['name']

# add university acronyms to df
info = ins[['institution_id', 'acronym']]
info = info.set_index('institution_id')
legend = info.to_dict()['acronym']
uni_num = df['institution_id'].tolist()
uni_name = [legend[uni] for uni in uni_num]
df['institution_acr'] = uni_name

# add university names to df
info = ins[['institution_id', 'name']]
info = info.set_index('institution_id')
legend = info.to_dict()['name']
uni_num = df['institution_id'].tolist()
uni_name = [legend[uni] for uni in uni_num]
df['institution_name'] = uni_name

# add type to df
info = ins[['institution_id', 'organization_type']]
info = info.set_index('institution_id')
legend = info.to_dict()['organization_type']
uni_num = df['institution_id'].tolist()
org_type = [legend[uni] for uni in uni_num]
df['type'] = org_type


# add total interaction column
df['total'] = df['total_aas'] + df['total_tw'] + df['total_wp'] + df['total_nw'] + df['total_po']

df.rename(columns = {'total_aas':'altmetric attention score', 'total_tw': 'twitter', 'total_wp': 'wikipedia', 'total_nw': 'news media', 'total_po': 'policy'}, inplace = True)

# only want universities
df_uni = df[df.type == 'University']
df_hospital = df[df.type == 'Hospital']


# #### Interaction Quantity Compare

# In[60]:


total_to_pub = {'twitter': 'tw_publications', 'altmetric attention score': 'aas_publications', 'policy': 'po_publications', 'wikipedia': 'wp_publications', 'news media': 'nw_publications'}
mini_df = df_uni[['esi', 'institution_acr', 'altmetric attention score', 'twitter', 'wikipedia', 'news media', 'policy']]

def get_plot(uni='UB', metric='twitter'):
    df_temp = df_uni[(df_uni.institution_acr == uni)]
    bar_plot = df_temp.hvplot.bar(x='esi', y=metric, legend='top', label='interactions', xlabel=None) # legend is documented bug
    scatter_plot = df_temp.hvplot.scatter(x='esi', y=total_to_pub[metric], c='red', legend='top', label='content quantity', xlabel=None)
    plots = bar_plot * scatter_plot
    plots.opts(opts.Overlay(title='Interactions based on Content Quantity', xaxis=None, height=500))
    return plots

dmap_int_quant = hv.DynamicMap(get_plot, kdims=['uni', 'metric']).redim.values(uni=list(df.institution_acr.unique()), metric=['altmetric attention score', 'twitter', 'wikipedia', 'news media', 'policy'])

int_quant_compare = pn.pane.HoloViews(dmap_int_quant, widgets={
    'metric': pn.widgets.Select, 
    'uni': pn.widgets.Select}, center=True).layout


# #### University Comparison

# ##### Modified Dataset

# In[84]:


df_uni.groupby('esi').sum()
esi = df_uni.groupby('esi').sum().index.to_list()
unis = df_uni.groupby('institution_acr').sum().index.to_list()
ins_df = df_uni.groupby(['institution_acr', 'esi']).sum()[['total']]
uni_df = ins_df.unstack(level=0)
uni_df.columns = uni_df.columns.droplevel(0)
uni_df = uni_df.fillna(0)
#uni_df.head()


# In[85]:


mini_df = df_uni[['esi', 'institution_acr', 'altmetric attention score', 'twitter', 'wikipedia', 'news media', 'policy']]

def get_plot(uni1='UGR', uni2='UB', field='Global'):
    df_unis = mini_df[(mini_df.esi == field) & ((mini_df.institution_acr == uni1) | (mini_df.institution_acr == uni2))]
    plot = df_unis.hvplot.bar(x='institution_acr', y=['altmetric attention score', 'twitter', 'wikipedia', 'news media', 'policy'], invert=True, legend=False, ylim=(0, 500000), title='University Comparison')
    return plot

# changing order of list to change default screen
unis1 = unis.copy()
unis1[0], unis1[36] = unis1[36], unis1[0]
esi[0], esi[10] = esi[10], esi[0]

dmap_uni_compare = hv.DynamicMap(get_plot, kdims=['uni1', 'uni2', 'field']).redim.values(uni1=unis, uni2=unis1, field=esi).opts(width=800, height=400, margins=(300, 50, 50, 50), ylabel='mentions', xlabel='')

uni_compare = pn.pane.HoloViews(dmap_uni_compare, widgets={
    'uni1': pn.widgets.Select,
    'uni2': pn.widgets.Select,
    'field': pn.widgets.Select}, center=True).layout


# #### University Rankings

# In[8]:


def get_rankings_plot(esi='Global'):
    df_filt = df_uni[(df_uni.esi == esi)]
    plot = df_filt.hvplot(x='institution_acr', y=['altmetric attention score', 'twitter', 'wikipedia', 'news media', 'policy'], kind='bar', stacked=True, colorbar=False, width=600, title='University Interactions Across Fields')
    return plot

dmap_uni_rankings_overall = hv.DynamicMap(get_rankings_plot, kdims=['esi']).redim.values(esi=esi).opts(width=800, height=400, ylabel='Interactions', xlabel='', margins=(50, 100, 50, 50))

uni_rankings_overall = pn.pane.HoloViews(dmap_uni_rankings_overall, widgets={'esi': pn.widgets.Select}, center=True).layout


# #### University Rankings by Metrics

# In[9]:


def get_rankings_metric_plot(metric='altmetric attention score', esi='Global'):
    df_filt = df_uni[(df_uni.esi == esi)]
    plot = df_filt.hvplot(x='institution_acr', y=metric, kind='bar', colorbar=False, width=600, title='University Interactions Across Fields and Metrics')
    return plot

dmap_uni_rankings = hv.DynamicMap(get_rankings_metric_plot, kdims=['metric', 'esi']).redim.values(metric=['altmetric attention score', 'twitter', 'wikipedia', 'news media', 'policy','total'],esi=esi).opts(height=400, width=800, ylabel='Interactions', xlabel='', margins=(50, 100, 50, 50))

uni_rankings = pn.pane.HoloViews(dmap_uni_rankings, widgets={
    'metric': pn.widgets.Select,
    'esi': pn.widgets.Select}, center=True).layout


# #### Intra-Institutional Comparison

# In[10]:


def get_uni_plot(uni='UGR'):
    df_filt = df_uni[(df_uni.institution_acr == uni)]
    plot = df_filt.hvplot(x='esi', y=['altmetric attention score', 'twitter', 'wikipedia', 'news media', 'policy'], kind='bar', stacked=True, colorbar=False, width=600, title='Intra-University Comparison')
    return plot

dmap_uni_overview = hv.DynamicMap(get_uni_plot, kdims=['uni']).redim.values(uni=unis).opts(height=400, width=800, ylabel='Interactions', xlabel='', margins=(50, 200, 50, 50))

uni_overview = pn.pane.HoloViews(dmap_uni_overview, widgets={'uni': pn.widgets.Select}, center=True).layout


# #### About page

# In[89]:


#https://panel.holoviz.org/api/panel.pane.html#panel.pane.JPG

# placeholder - needs to be pn.pane.something to render in Tabs
about = pn.pane.HTML('''<h3>About</h3> 
                        <p>The visualizations here were developed using the <a href="https://ranking.influscience.eu/estadisticas-y-datos/" style="color:#36AE7C;">influsciencer2 dataset</a>
                        as part of the <a href="https://influscience.eu/" style="color:#36AE7C;">InfluScience</a> project
                        as a way to visualize university research interactions across different platforms and disciplines.</p>
                        <h3>Author</h3>
                        <h4>Jennifer Cantrell</h4>
                        <p>Jennifer Cantrell is an undergraduate student at the University of Michigan studying Data Science and Spanish.
                        She spent a semester studying in Granada, Spain, where she collaborated with the 
                        <a href="https://ec3-research.com/" style="color:#36AE7C;">EC3 Research Group</a> and
                        InfluScience project.</p>''',
    style={'background-color': '#F6F6F6'}, width=600, height=400)
#about


# #### Tabs

# In[44]:


tabs = pn.Tabs(
    ('Quantity-Interactions', int_quant_compare),
    ('University Comparison', uni_compare),
    ('University Rankings', uni_rankings_overall),
    ('University Rankings by Metric', uni_rankings),
    ('Intra-University Comparison', uni_overview),
    ('About', about),
    dynamic=True
)
#tabs


# #### App

# In[61]:


pn.template.FastListTemplate(site="InfluScience", title="Interactive Dashboard", main=[tabs]).servable();


# In[ ]:






await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()