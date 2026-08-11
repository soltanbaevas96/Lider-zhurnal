select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('curators', 'assistants', 'teachers')
  and column_name in ('profile_id', 'id', 'full_name')
order by table_name, column_name;
