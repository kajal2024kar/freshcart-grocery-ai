@echo off

REM Ensure a virtual environment exists
if not exist venv (
    python -m venv venv
)

call venv\Scripts\activate.bat

REM Upgrade pip and install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

REM Launch the Streamlit app
streamlit run streamlit_app.py %*
